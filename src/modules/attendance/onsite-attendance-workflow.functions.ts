import { assertSchoolDayPreparation } from "@/domain/onsite-day-preparation";
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "@/db/client";
import {
  attendanceEvents, attendanceExcuses, documents, enrollments, guardianRelationships,
  accountPersonGrants, accessAccounts, people, programs, sections, sectionTeachers, schoolYears, sites, studentProfiles, terms,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { assertOnsiteAttendanceScope, isOnsiteAttendanceRole } from "@/domain/onsite-attendance-access";
import { requireCurrentSiteLocalDelegate, requiresIndependentChurchLocalDelegation } from "@/modules/operations/site-local-delegation.server";
import { activeFacilitatorSectionIds, requireCurrentSectionFacilitator } from "@/modules/operations/site-section-facilitators.server";
import { readLocalSchoolOpeningStatus } from "@/modules/operations/school-opening.server";
import { effectiveAttendanceEvents } from "@/domain/effective-attendance";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { siteDate } from "@/domain/expected-attendance";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { loadExpectedAttendanceCoverage } from "./expected-attendance-queries";
import { closeObsoleteAttendanceExcuse, recordAttendanceRevision, submitAttendanceExcuse, reviewAttendanceExcuse } from "./attendance-service";

const uuid = z.string().uuid();
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + "T12:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Invalid school date");
const occurrence = (date: string) => date + ":site-day";

async function staff(capability: string) {
  setResponseHeader("Cache-Control", "private, no-store");
  const actor = await getCommandContext(getRequest());
  if (isOnsiteAttendanceRole(actor.role)) {
    // Onsite staff may ONLY read expected rosters and record attendance;
    // guardian excuse review and academic/registrar actions remain barred.
    if (capability !== "attendance.write")
      throw new AuthorizationError("onsite staff cannot review attendance excuses");
    assertOnsiteAttendanceScope(actor);
  } else {
    assertCapability(actor, capability);
    if (!["registrar", "teacher"].includes(actor.role))
      throw new AuthorizationError("verified attendance staff role");
  }
  if (!actor.actorPersonId || !actor.scope.organizationIds?.length ||
      (isOnsiteAttendanceRole(actor.role) &&
       (!actor.scope.programIds?.length || !actor.scope.siteIds?.length)))
    throw new AuthorizationError("verified attendance staff grant");
  return actor;
}
async function guardian() {
  setResponseHeader("Cache-Control", "private, no-store");
  const actor = await getCommandContext(getRequest());
  assertCapability(actor, "attendance.excuse.submit");
  if (actor.role !== "guardian" || !actor.actorPersonId ||
      !actor.scope.programIds?.length || !actor.scope.siteIds?.length)
    throw new AuthorizationError("verified guardian attendance grant");
  return actor;
}

/** Convert midnight in the school's zone into an absolute instant (DST-safe). */
function siteDayStart(date: string, timeZone: string): Date {
  const target = Date.parse(date + "T00:00:00.000Z");
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const wall = Object.fromEntries(format.formatToParts(new Date(instant))
      .filter(p => p.type !== "literal").map(p => [p.type, p.value]));
    const actual = Date.UTC(Number(wall.year), Number(wall.month) - 1, Number(wall.day),
      Number(wall.hour), Number(wall.minute));
    const delta = target - actual;
    if (!delta) break;
    instant += delta;
  }
  return new Date(instant);
}

async function scopedOnsitePrograms(actor: AccessContext, selectedId?: string, siteId?: string, preparation=false) {
  // The inner join on sites guarantees a non-null site for every row.
  const rows = (await db.select({
    id: programs.id, name: programs.name, organizationId: programs.organizationId,
    siteId: programs.siteId, deliveryModel: programs.deliveryModel,
    timezone: sites.timezone,
  }).from(programs).innerJoin(sites, eq(sites.id, programs.siteId))
    .where(and(
      inArray(programs.organizationId, actor.scope.organizationIds!),
      preparation?inArray(programs.status,["launching","ready","active"]):eq(programs.status,"active"),
      ...(actor.scope.programIds!==undefined?[inArray(programs.id,actor.scope.programIds)]:[]),
      ...(actor.scope.siteIds!==undefined?[inArray(programs.siteId,actor.scope.siteIds)]:[]),
      ...(isOnsiteAttendanceRole(actor.role) ? [eq(programs.siteId, actor.grantSiteId!)] : []),
      ...(siteId ? [eq(programs.siteId, siteId)] : []),
      ...(selectedId ? [eq(programs.id, selectedId)] : []),
    ))).filter((row): row is Omit<typeof row, "siteId"> & { siteId: string } =>
      row.siteId !== null);
  const onsite = rows.filter(p => p.deliveryModel.onsite === true);
  // An independently hosted CAN school has explicit director and named
  // Section facilitator appointments, NOT a site_staff-wide roster role.
  // A generic staff grant must never reveal the church's children or enable
  // the attendance command, including an offline mutation replay.
  if(actor.role==="site_staff"){
    const permitted=[];
    for(const program of onsite){
      if(!await requiresIndependentChurchLocalDelegation(db,program.id))
        permitted.push(program);
    }
    return permitted;
  }
  // Verified role/site membership alone no longer exposes the whole church's
  // pupil roster. Named director/facilitator delegation is Program-scoped.
  if (actor.role !== "site_leader" && actor.role !== "room_facilitator")
    return onsite;
  const delegated = [];
  for (const program of onsite) {
    try {
      if (actor.role === "site_leader") {
        await requireCurrentSiteLocalDelegate(db, actor, program.id, "site_director");
      } else if (await requiresIndependentChurchLocalDelegation(db, program.id)) {
        const sections = await activeFacilitatorSectionIds(db, actor, program.id);
        if (!sections.length) continue;
      }
      delegated.push(program);
    } catch (error) {
      if (!(error instanceof AuthorizationError)) throw error;
    }
  }
  return delegated;
}

/** One server-authorized program/student/date entitlement, used for reads and writes. */
async function resolveExpectedRoster(actor: AccessContext,
  date: string, programId?: string, studentId?: string, siteId?: string, preparation=false) {
  const programsAtSite = await scopedOnsitePrograms(actor, programId, siteId, preparation);
  const expectedIds = new Map<string, Set<string>>();
  const coverage = await loadExpectedAttendanceCoverage(programsAtSite, [], new Date(), 1,
    { date, studentIds: expectedIds });
  const activePrograms = programsAtSite.filter(p => preparation || siteDate(new Date(), p.timezone) >= date);

  // A registrar can manage a program roster. A teacher can only mark a
  // student in an active section they are actually assigned to teach.
  const permittedIds = activePrograms.map(p => p.id);
  if (!permittedIds.length) return { roster: [], sectionMemberships: [], unplacedStudents: [], coverage, programsAtSite };

  // A child is expected at an independently church-hosted CAN school
  // only after placement in a real instructional Section. A Program-only
  // admission is not a safe, supervised classroom placement.
  const independentPrograms=new Set<string>();
  for(const program of activePrograms){
    if(await requiresIndependentChurchLocalDelegation(db,program.id))
      independentPrograms.add(program.id);
  }
  // A facilitator may read ONLY children currently assigned to a Section
  // with an effective named appointment—not the entire Program roster.
  const sectionFilter = new Set<string>();
  if (actor.role === "room_facilitator") {
    for (const program of activePrograms) {
      if (await requiresIndependentChurchLocalDelegation(db, program.id)) {
        for (const id of await activeFacilitatorSectionIds(db, actor, program.id))
          sectionFilter.add(id);
      } else {
        // Existing non-independent sites continue using established staff grants.
        const rows = await db.select({ id: sections.id }).from(sections)
          .where(and(eq(sections.programId, program.id),
            eq(sections.siteId, program.siteId), eq(sections.active, true)));
        for (const row of rows) sectionFilter.add(row.id);
      }
    }
  }
  const programRoster = (actor.role === "registrar" ||
    actor.role === "site_leader" || actor.role === "site_staff") ? await db.select({
    studentProfileId: enrollments.studentProfileId, programId: enrollments.programId,
    preferredName: people.preferredName, firstName: people.legalFirstName,
    lastName: people.legalLastName,
  }).from(enrollments)
    .innerJoin(studentProfiles, eq(studentProfiles.id, enrollments.studentProfileId))
    .innerJoin(people, eq(people.id, studentProfiles.personId))
    .where(and(eq(enrollments.kind, "program"), eq(enrollments.status, "active"),
      inArray(enrollments.programId, permittedIds),
      ...(studentId ? [eq(enrollments.studentProfileId, studentId)] : []))) : [];

  // A stale Section enrollment does not establish physical attendance
  // eligibility after its Program enrollment or school year is withdrawn.
  const activeProgramEnrollment=alias(enrollments,"onsite_current_program_enrollment");
  const sectionsAtSite = await db.select({
    studentProfileId: enrollments.studentProfileId, programId: sections.programId,
    siteId: sections.siteId, sectionId: sections.id, sectionTitle: sections.title,
    preferredName: people.preferredName, firstName: people.legalFirstName,
    lastName: people.legalLastName,
  }).from(enrollments)
    .innerJoin(sections, eq(sections.id, enrollments.sectionId))
    .innerJoin(terms, eq(terms.id, sections.termId))
    .innerJoin(activeProgramEnrollment,and(
      eq(activeProgramEnrollment.studentProfileId,enrollments.studentProfileId),
      eq(activeProgramEnrollment.programId,sections.programId),
      eq(activeProgramEnrollment.schoolYearId,terms.schoolYearId),
      eq(activeProgramEnrollment.kind,"program"),
      eq(activeProgramEnrollment.status,"active"),
    ))
    .innerJoin(schoolYears, eq(schoolYears.id, terms.schoolYearId))
    .innerJoin(studentProfiles, eq(studentProfiles.id, enrollments.studentProfileId))
    .innerJoin(people, eq(people.id, studentProfiles.personId))
    .leftJoin(sectionTeachers, eq(sectionTeachers.sectionId, sections.id))
    .where(and(eq(enrollments.kind, "section"), eq(enrollments.status, "active"),
      eq(enrollments.programId,sections.programId),
      eq(enrollments.schoolYearId,terms.schoolYearId),
      eq(sections.active, true), eq(schoolYears.status, "active"),
      lte(schoolYears.startsOn, date), gte(schoolYears.endsOn, date),
      inArray(sections.programId, permittedIds),
      ...(actor.scope.siteIds!==undefined?[inArray(sections.siteId,actor.scope.siteIds)]:[]),
      ...(actor.role === "room_facilitator" ? [inArray(sections.id, [...sectionFilter])] : []),
      ...(actor.role === "teacher" ? [eq(sectionTeachers.personId, actor.actorPersonId!)] :
        []),
      ...(studentId ? [eq(enrollments.studentProfileId, studentId)] : [])));
  const byKey = new Map<string, {
    studentProfileId: string; programId: string; studentName: string;
    sectionTitle: string | null; siteId: string; sectionId: string | null;
  }>();
  for (const row of programRoster) {
    // Keep planning and enrollment lists separate from the live school's
    // physical attendance roster until this child has a real Section.
    if (!row.programId || independentPrograms.has(row.programId) ||
        !expectedIds.get(row.programId)?.has(row.studentProfileId)) continue;
    const host = activePrograms.find(p => p.id === row.programId)!;
    byKey.set(row.programId + ":" + row.studentProfileId, {
      studentProfileId: row.studentProfileId, programId: row.programId,
      studentName: row.preferredName ?? (row.firstName + " " + row.lastName),
      sectionTitle: null, siteId: host.siteId!, sectionId: null,
    });
  }
  for (const row of sectionsAtSite) {
    if (!expectedIds.get(row.programId)?.has(row.studentProfileId)) continue;
    const host = activePrograms.find(p => p.id === row.programId);
    if (!host || host.siteId !== row.siteId) continue;
    const key = row.programId + ":" + row.studentProfileId;
    const old = byKey.get(key);
    byKey.set(key, {
      studentProfileId: row.studentProfileId, programId: row.programId,
      studentName: row.preferredName ?? (row.firstName + " " + row.lastName),
      sectionTitle: old?.sectionTitle ?? row.sectionTitle,
      siteId: row.siteId!, sectionId: old?.sectionId ?? row.sectionId,
    });
  }
  const memberships=new Map<string,{studentProfileId:string;studentName:string;programId:string;sectionId:string;sectionTitle:string}>();
  for(const row of sectionsAtSite){
    if(!expectedIds.get(row.programId)?.has(row.studentProfileId))continue;
    const host=activePrograms.find(program=>program.id===row.programId);
    if(!host||host.siteId!==row.siteId)continue;
    memberships.set(row.programId+":"+row.sectionId+":"+row.studentProfileId,{
      studentProfileId:row.studentProfileId,studentName:row.preferredName??row.firstName+" "+row.lastName,
      programId:row.programId,sectionId:row.sectionId,sectionTitle:row.sectionTitle,
    });
  }
  const unplacedStudents=preparation?[...new Map(programRoster.filter(row=>row.programId&&
    independentPrograms.has(row.programId)&&expectedIds.get(row.programId)?.has(row.studentProfileId)&&
    !byKey.has(row.programId+":"+row.studentProfileId)).map(row=>[row.programId+":"+row.studentProfileId,{
      studentProfileId:row.studentProfileId,programId:row.programId!,
      studentName:row.preferredName??row.firstName+" "+row.lastName,
    }])).values()]:[];
  return { roster: [...byKey.values()], sectionMemberships:[...memberships.values()], unplacedStudents, coverage, programsAtSite };
}

/** Localized date and verified site identity for room facilitators. */
export const getOnsiteStaffDayContext = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getCommandContext(getRequest());
    assertOnsiteAttendanceScope(actor);
    const [site] = await db.select({
      id: sites.id, name: sites.name, timezone: sites.timezone,
      organizationId: sites.organizationId,
    }).from(sites).where(eq(sites.id, actor.grantSiteId!)).limit(1);
    if (!site || !actor.scope.organizationIds?.includes(site.organizationId))
      throw new AuthorizationError("site day organization and site match");
    return {
      siteId: site.id, siteName: site.name, timeZone: site.timezone,
      date: siteDate(new Date(), site.timezone),
      canPrepareSchoolDays:actor.role==="site_leader"&&!actor.demoFacilitator,
      preparationThrough:siteDate(new Date(Date.now()+30*86400_000),site.timezone),
      note: "Staff-recorded onsite attendance. Online activity does not establish physical presence or departure.",
    };
  });

/** Internal projection for callers that already authorized this actor and Site. */
export const loadExpectedOnsiteRosterForActor=createServerOnlyFn(async (actor:AccessContext,data:{
  date:string;programId?:string;siteId?:string;
})=>{
  const { roster, coverage, programsAtSite } = await resolveExpectedRoster(actor,
    data.date, data.programId, undefined, data.siteId);
  const rosterIds = [...new Set(roster.map(r => r.studentProfileId))];
  const events = rosterIds.length ? await db.select({
    id: attendanceEvents.id, studentProfileId: attendanceEvents.studentProfileId,
    programId: attendanceEvents.programId, occurrenceKey: attendanceEvents.occurrenceKey,
    status: attendanceEvents.status, recordedAt: attendanceEvents.recordedAt,
  }).from(attendanceEvents).where(and(
    inArray(attendanceEvents.programId, programsAtSite.map(p => p.id)),
    inArray(attendanceEvents.studentProfileId, rosterIds),
    eq(attendanceEvents.occurrenceKey, occurrence(data.date)))) : [];
  const effective = new Map(effectiveAttendanceEvents(events)
    .map(e => [e.programId + ":" + e.studentProfileId, e]));
  return {
    date: data.date,
    programs: programsAtSite.map(p => ({
      id: p.id, name: p.name, configuration: coverage.get(p.id)?.configuration ?? "not_onsite",
      expectedDays: coverage.get(p.id)?.expectedDays ?? 0,
      missingCalendarDates: coverage.get(p.id)?.daysWithoutCalendarConfiguration ?? 0,
    })),
    students: roster.map(r => {
      const record = effective.get(r.programId + ":" + r.studentProfileId);
      return {
        studentProfileId: r.studentProfileId, programId: r.programId,
        programName: programsAtSite.find(p => p.id === r.programId)!.name,
        studentName: r.studentName, sectionTitle: r.sectionTitle,
        sectionId: r.sectionId,
        occurrenceKey: occurrence(data.date),
        attendanceEventId: record?.id ?? null,
        status: record?.status ?? "unmarked",
      };
    }).sort((a, b) => a.studentName.localeCompare(b.studentName) ||
      a.programName.localeCompare(b.programName)),
  };
});

/** Same canonical enrollment/calendar resolver as today's roster. No attendance
 * events are read or projected as observations for a preparation date. */
/** Read-only student-specific future day. This does not load attendance events. */
export const loadExpectedFirstDayPreparationForActor=createServerOnlyFn(async(actor:AccessContext,data:{
  date:string;programId:string;siteId:string;studentProfileId:string;
})=>{
  if(actor.role!=="registrar" || !actor.actorPersonId || actor.demoFacilitator)
    throw new AuthorizationError("verified registrar future first-day preparation");
  assertCapability(actor,"enrollment.activate");
  if(!actor.scope.organizationIds?.length ||
    !actor.scope.siteIds?.includes(data.siteId) ||
    !actor.scope.programIds?.includes(data.programId))
    throw new AuthorizationError("original registrar Site and Program grant");
  if(!dateField.safeParse(data.date).success || !uuid.safeParse(data.studentProfileId).success ||
    !uuid.safeParse(data.programId).success || !uuid.safeParse(data.siteId).success)
    throw new AuthorizationError("valid scoped school-day preparation identifiers");
  const [site]=await db.select({id:sites.id,organizationId:sites.organizationId,
    timezone:sites.timezone}).from(sites).where(eq(sites.id,data.siteId)).limit(1);
  if(!site || !actor.scope.organizationIds.includes(site.organizationId) ||
    (actor.grantSiteId && actor.grantSiteId!==site.id))
    throw new AuthorizationError("original registrar organization and Site");
  const today=siteDate(new Date(),site.timezone);
  if(data.date<today)throw new AuthorizationError("future first-day date cannot be in the past");
  const {roster,sectionMemberships,unplacedStudents,coverage,programsAtSite}=
    await resolveExpectedRoster(actor,data.date,data.programId,data.studentProfileId,data.siteId,true);
  const program=programsAtSite.find(row=>row.id===data.programId &&
    row.siteId===data.siteId && row.organizationId===site.organizationId);
  if(!program)throw new AuthorizationError("active onsite registrar Program");
  const matched=roster.find(row=>row.studentProfileId===data.studentProfileId &&
    row.programId===data.programId);
  // A Section assignment is not proof that a currently authorized CAN teacher exists.
  const qualifiedTeachers=matched?.sectionId?await db.select({personId:sectionTeachers.personId})
    .from(sectionTeachers)
    .innerJoin(people,eq(people.id,sectionTeachers.personId))
    .innerJoin(accountPersonGrants,and(eq(accountPersonGrants.personId,sectionTeachers.personId),
      eq(accountPersonGrants.role,"teacher"),eq(accountPersonGrants.organizationId,site.organizationId),
      eq(accountPersonGrants.active,true),eq(accountPersonGrants.isSynthetic,false)))
    .innerJoin(accessAccounts,eq(accessAccounts.id,accountPersonGrants.accountId))
    .where(and(eq(sectionTeachers.sectionId,matched.sectionId),
      eq(sectionTeachers.role,"teacher"),eq(people.active,true),
      eq(accessAccounts.disabled,false),isNotNull(accessAccounts.emailVerifiedAt),
      eq(accountPersonGrants.siteId,data.siteId)))
    .limit(1):[];
  return {qualifiedTeacherAssigned:qualifiedTeachers.length>0,
    date:data.date,program:{id:program.id,name:program.name,
      configuration:coverage.get(program.id)?.configuration??"not_onsite",
      expectedDays:coverage.get(program.id)?.expectedDays??0,
      missingCalendarDates:coverage.get(program.id)?.daysWithoutCalendarConfiguration??0},
    student:matched?{studentProfileId:matched.studentProfileId,programId:matched.programId,
      studentName:matched.studentName,sectionId:matched.sectionId,
      sectionTitle:matched.sectionTitle,status:"unmarked" as const}:null,
    sectionMemberships:sectionMemberships.filter(row=>row.studentProfileId===data.studentProfileId &&
      row.programId===data.programId),
    unplaced:unplacedStudents.some(row=>row.studentProfileId===data.studentProfileId &&
      row.programId===data.programId),
  };
});

export const loadExpectedSchoolDayPreparation=createServerOnlyFn(async(actor:AccessContext,data:{date:string})=>{
  const [site]=await db.select({id:sites.id,organizationId:sites.organizationId,timezone:sites.timezone,name:sites.name})
    .from(sites).where(eq(sites.id,actor.grantSiteId!)).limit(1);
  if(!site)throw new AuthorizationError("original school preparation Site");
  assertSchoolDayPreparation(actor,site,data.date);
  const {roster,sectionMemberships,unplacedStudents,coverage,programsAtSite}=await resolveExpectedRoster(actor,data.date,undefined,undefined,site.id,true);
  return {site,date:data.date,
    programs:programsAtSite.map(program=>({id:program.id,name:program.name,
      configuration:coverage.get(program.id)?.configuration??"not_onsite",
      expectedDays:coverage.get(program.id)?.expectedDays??0,
      missingCalendarDates:coverage.get(program.id)?.daysWithoutCalendarConfiguration??0})),
    students:roster.map(row=>({studentProfileId:row.studentProfileId,studentName:row.studentName,programId:row.programId})),
    sectionMemberships,unplacedStudents,
  };
});

export const listExpectedOnsiteRoster = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({
    date: dateField, programId: uuid.optional(),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await staff("attendance.write");
    return loadExpectedOnsiteRosterForActor(actor, data);
  });

/**
 * Local-operator opening projection: for each onsite Program this staff
 * member is already scoped to see, whether an independently hosted
 * church/CAN school is currently authorized to operate. Only the
 * configuration status and non-sensitive blocker categories are returned —
 * never evidence documents, verifier identity or CAN review internals.
 * Programs without an independent church/CAN identity produce no entry.
 */
export const getSiteDayOpeningStatuses = createServerFn({ method: "GET" })
  .handler(async () => {
    const actor = await staff("attendance.write");
    const programsAtSite = await scopedOnsitePrograms(actor);
    const statuses = [];
    for (const program of programsAtSite) {
      try {
        statuses.push(await readLocalSchoolOpeningStatus(actor, program.id));
      } catch (error) {
        if (!(error instanceof AuthorizationError)) throw error;
        // Not an independently hosted church/CAN school: no opening gate applies.
      }
    }
    return { statuses };
  });

export const markExpectedOnsiteAttendance = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    date: dateField, studentProfileId: uuid, programId: uuid,
    status: z.enum(["present", "absent", "tardy"]),
    mutationId: uuid, expectedPreviousEventId: uuid.nullable().optional(),
    note: z.string().max(2000).optional(),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await staff("attendance.write");
    const [program] = await scopedOnsitePrograms(actor, data.programId);
    if (!program) throw new AuthorizationError("attendance program scope");
    if (data.date > siteDate(new Date(), program.timezone))
      throw new Error("Future attendance dates cannot be marked");

    // A previously committed offline mutation can be retried safely without
    // requiring a student to retain enrollment after the original mark.
    const [replay] = await db.select({
      id: attendanceEvents.id, studentProfileId: attendanceEvents.studentProfileId,
      programId: attendanceEvents.programId, status: attendanceEvents.status,
      occurrenceKey: attendanceEvents.occurrenceKey, sectionId: attendanceEvents.sectionId,
    }).from(attendanceEvents).where(
      eq(attendanceEvents.sourceKey, "manual-revision:" + data.mutationId)).limit(1);
    if (replay) {
      if (replay.studentProfileId !== data.studentProfileId ||
        replay.programId !== data.programId || replay.occurrenceKey !== occurrence(data.date) ||
        replay.status !== data.status)
        throw new Error("Attendance mutation ID was already used for different input");
      if (isOnsiteAttendanceRole(actor.role)) {
        assertOnsiteAttendanceScope(actor, program.siteId);
        if (actor.role === "room_facilitator" &&
            await requiresIndependentChurchLocalDelegation(db, program.id)) {
          if (!replay.sectionId) throw new AuthorizationError("replay requires a named Section");
          await requireCurrentSectionFacilitator(db, actor, program.id, replay.sectionId);
        }
      }
      if (actor.role === "teacher") {
        if (!replay.sectionId) throw new AuthorizationError("teacher attendance replay section");
        const [assignment] = await db.select({ id: sectionTeachers.id })
          .from(sectionTeachers).where(and(
            eq(sectionTeachers.sectionId, replay.sectionId),
            eq(sectionTeachers.personId, actor.actorPersonId!))).limit(1);
        if (!assignment) throw new AuthorizationError("teacher attendance replay assignment");
      }
      return { attendanceEventId: replay.id };
    }

    if (isOnsiteAttendanceRole(actor.role)) {
      assertOnsiteAttendanceScope(actor, program.siteId);
      // Permit bounded staff-attested corrections for a missed onsite day;
      // never permit unrestricted backdating or future attendance.
      const earliest = siteDate(new Date(Date.now() - 30 * 86400_000), program.timezone);
      if (data.date < earliest || data.date > siteDate(new Date(), program.timezone))
        throw new AuthorizationError("onsite staff attendance limited to recent school-local days");
      if (data.expectedPreviousEventId === undefined)
        throw new AuthorizationError("onsite correction requires prior-record acknowledgement");
      if (data.expectedPreviousEventId && (data.note?.trim().length ?? 0) < 10)
        throw new Error("Explain any onsite attendance correction (10 characters minimum)");
    }
    const { roster } = await resolveExpectedRoster(actor, data.date, data.programId,
      data.studentProfileId);
    const eligible = roster.find(r => r.programId === data.programId &&
      r.studentProfileId === data.studentProfileId);
    if (!eligible) throw new AuthorizationError(
      "No authorized scheduled onsite enrollment for this student/program/date");
    const attendanceEventId = await recordAttendanceRevision(actor, {
      studentProfileId: eligible.studentProfileId,
      programId: eligible.programId, siteId: eligible.siteId,
      sectionId: eligible.sectionId ?? undefined,
      occurrenceKey: occurrence(data.date), status: data.status,
      expectedAt: siteDayStart(data.date, program.timezone),
      mutationId: data.mutationId, note: data.note,
      expectedPreviousEventId: data.expectedPreviousEventId,
      requireExpectedOnsiteDate: data.date,
    });
    return { attendanceEventId };
  });

/**
 * Guardian read model: pick the latest correction for each entire occurrence,
 * not the old absent-event subset. Keep an excuse attached to its original
 * event and expose a new excuse control only for the latest absent/tardy mark.
 */
export const listGuardianEffectiveAbsences = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({
    studentPersonId: uuid.optional(),
  }).parse(value ?? {}))
  .handler(async ({ data }) => {
    const actor = await guardian();
    const relationships = await db.select({
      studentPersonId: guardianRelationships.studentPersonId,
      preferredName: people.preferredName, firstName: people.legalFirstName,
      lastName: people.legalLastName,
    }).from(guardianRelationships)
      .innerJoin(people, eq(people.id, guardianRelationships.studentPersonId))
      .where(and(
        guardianRelationshipPredicate({
          guardianPersonId: actor.actorPersonId!,
          access: "academic",
        }),
        ...(data.studentPersonId ?
          [eq(guardianRelationships.studentPersonId, data.studentPersonId)] : [])));
    if (!relationships.length) return { absences: [] };
    const profiles = await db.select({
      id: studentProfiles.id, personId: studentProfiles.personId,
    }).from(studentProfiles).where(
      inArray(studentProfiles.personId, relationships.map(r => r.studentPersonId)));
    if (!profiles.length) return { absences: [] };

    const cutoff = new Date(Date.now() - 45 * 86400000);
    const records = await db.select({
      id: attendanceEvents.id, studentProfileId: attendanceEvents.studentProfileId,
      programId: attendanceEvents.programId, siteId: attendanceEvents.siteId,
      occurrenceKey: attendanceEvents.occurrenceKey, status: attendanceEvents.status,
      expectedAt: attendanceEvents.expectedAt, recordedAt: attendanceEvents.recordedAt,
    }).from(attendanceEvents).where(and(
      inArray(attendanceEvents.studentProfileId, profiles.map(p => p.id)),
      inArray(attendanceEvents.programId, actor.scope.programIds!),
      inArray(attendanceEvents.siteId, actor.scope.siteIds!),
      gte(attendanceEvents.expectedAt, cutoff),
      lte(attendanceEvents.expectedAt, new Date())));
    if (!records.length) return { absences: [] };
    const facts = effectiveAttendanceEvents(records);
    const allByOccurrence = new Map<string, typeof records>();
    for (const row of records) {
      const key = [row.studentProfileId, row.programId, row.occurrenceKey].join(":");
      const history = allByOccurrence.get(key) ?? [];
      history.push(row);
      allByOccurrence.set(key, history);
    }
    const excuses = await db.select({
      id: attendanceExcuses.id, attendanceEventId: attendanceExcuses.attendanceEventId,
      status: attendanceExcuses.status, reason: attendanceExcuses.reason,
      reviewNote: attendanceExcuses.reviewNote, reviewedAt: attendanceExcuses.reviewedAt,
      createdAt: attendanceExcuses.createdAt,
    }).from(attendanceExcuses).where(
      inArray(attendanceExcuses.attendanceEventId, records.map(r => r.id)))
      .orderBy(desc(attendanceExcuses.createdAt));

    const profileToPerson = new Map(profiles.map(p => [p.id, p.personId]));
    const nameByPerson = new Map(relationships.map(r => [r.studentPersonId,
      r.preferredName ?? (r.firstName + " " + r.lastName)]));
    return {
      absences: facts.filter(f => {
        const key = [f.studentProfileId, f.programId, f.occurrenceKey].join(":");
        return allByOccurrence.get(key)?.some(r => r.status === "absent" ||
          r.status === "tardy") ?? false;
      }).sort((a, b) => b.expectedAt.getTime() - a.expectedAt.getTime())
        .slice(0, 50).map(f => {
          const key = [f.studentProfileId, f.programId, f.occurrenceKey].join(":");
          const history = allByOccurrence.get(key) ?? [];
          const earliest = [...history].sort((a, b) =>
            a.recordedAt.getTime() - b.recordedAt.getTime())[0]!;
          // A later absence after an approved excuse is a NEW case: do not
          // mask it behind the historical approval for the earlier mark.
          const excuse = excuses.find(e => e.attendanceEventId === f.id) ??
            (f.status === "excused" ? excuses.find(e => e.status === "approved" &&
              history.some(r => r.id === e.attendanceEventId)) : undefined);
          const eventId = excuse?.attendanceEventId ?? f.id;
          return {
            attendanceEventId: eventId,
            relatedAttendanceEventIds: history.map(row => row.id),
            studentPersonId: profileToPerson.get(f.studentProfileId) ?? "",
            studentName: nameByPerson.get(profileToPerson.get(f.studentProfileId) ?? "") ?? "Student",
            expectedAt: f.expectedAt.toISOString(),
            status: f.status, originalStatus: earliest.status,
            historicalExcuses: excuses.filter(row => history.some(event => event.id === row.attendanceEventId) &&
              row.id !== excuse?.id).map(row => ({
                excuseId: row.id, attendanceEventId: row.attendanceEventId, status: row.status,
                reason: row.reason, reviewNote: row.reviewNote,
                reviewedAt: row.reviewedAt?.toISOString() ?? null,
              })),
            excuse: excuse ? {
              excuseId: excuse.id, status: excuse.status, reason: excuse.reason,
              reviewNote: excuse.reviewNote,
              reviewedAt: excuse.reviewedAt?.toISOString() ?? null,
            } : null,
          };
        }),
    };
  });

export const submitEffectiveAttendanceExcuse = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    attendanceEventId: uuid, reason: z.string().trim().min(3).max(2000),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await guardian();
    const [record] = await db.select({
      id: attendanceEvents.id, studentProfileId: attendanceEvents.studentProfileId,
      programId: attendanceEvents.programId, siteId: attendanceEvents.siteId,
      occurrenceKey: attendanceEvents.occurrenceKey,
    }).from(attendanceEvents).where(
      eq(attendanceEvents.id, data.attendanceEventId)).limit(1);
    if (!record || !actor.scope.programIds?.includes(record.programId) ||
      !record.siteId || !actor.scope.siteIds?.includes(record.siteId))
      throw new AuthorizationError("guardian attendance occurrence");
    const [profile] = await db.select({ personId: studentProfiles.personId })
      .from(studentProfiles).where(eq(studentProfiles.id, record.studentProfileId)).limit(1);
    const [relation] = profile ? await db.select({ id: guardianRelationships.id })
      .from(guardianRelationships).where(and(
        guardianRelationshipPredicate({
          guardianPersonId: actor.actorPersonId!,
          studentPersonId: profile.personId,
          access: "academic",
        }),
        eq(guardianRelationships.canSubmitAttendanceExcuse, true))).limit(1) : [];
    if (!relation) throw new AuthorizationError("guardian cannot excuse this student");

    const events = await db.select({
      id: attendanceEvents.id, studentProfileId: attendanceEvents.studentProfileId,
      programId: attendanceEvents.programId, occurrenceKey: attendanceEvents.occurrenceKey,
      status: attendanceEvents.status, recordedAt: attendanceEvents.recordedAt,
    }).from(attendanceEvents).where(and(
      eq(attendanceEvents.studentProfileId, record.studentProfileId),
      eq(attendanceEvents.programId, record.programId),
      eq(attendanceEvents.occurrenceKey, record.occurrenceKey)));
    const [effective] = effectiveAttendanceEvents(events);
    if (!effective || effective.id !== data.attendanceEventId ||
      !["absent", "tardy"].includes(effective.status))
      throw new Error("This attendance record was corrected. Refresh before submitting an excuse");
    const excuseId = await submitAttendanceExcuse(actor, data);
    return { excuseId };
  });


/**
 * Read and review the same current correction chain as a guardian sees.
 * The queue is scoped by the caller's school and teacher-section assignment,
 * unlike the legacy program-only pending-excuse aggregation.
 */
export const listExpectedPendingExcuses = createServerFn({ method: "GET" })
  .handler(async () => {
    const actor = await staff("attendance.excuse.review");
    const base = db.select({
      excuseId: attendanceExcuses.id,
      attendanceEventId: attendanceExcuses.attendanceEventId,
      documentIds: attendanceExcuses.documentIds,
      studentProfileId: attendanceEvents.studentProfileId,
      programId: attendanceEvents.programId,
      occurrenceKey: attendanceEvents.occurrenceKey,
      reason: attendanceExcuses.reason,
      submittedAt: attendanceExcuses.createdAt,
      eventStatus: attendanceEvents.status,
      expectedAt: attendanceEvents.expectedAt,
      preferredName: people.preferredName,
      legalFirstName: people.legalFirstName, legalLastName: people.legalLastName,
    }).from(attendanceExcuses)
      .innerJoin(attendanceEvents, eq(attendanceEvents.id, attendanceExcuses.attendanceEventId))
      .innerJoin(studentProfiles, eq(studentProfiles.id, attendanceEvents.studentProfileId))
      .innerJoin(people, eq(people.id, studentProfiles.personId))
      .innerJoin(programs, eq(programs.id, attendanceEvents.programId));
    const rows = actor.role === "teacher" ? await base
      .innerJoin(sectionTeachers, eq(sectionTeachers.sectionId, attendanceEvents.sectionId))
      .where(and(
        eq(attendanceExcuses.status, "submitted"),
        eq(sectionTeachers.personId, actor.actorPersonId!),
        inArray(attendanceEvents.programId, actor.scope.programIds!),
        inArray(attendanceEvents.siteId, actor.scope.siteIds!),
        inArray(programs.organizationId, actor.scope.organizationIds!),
      )).orderBy(attendanceExcuses.createdAt).limit(100) :
      await base.where(and(
        eq(attendanceExcuses.status, "submitted"),
        inArray(attendanceEvents.programId, actor.scope.programIds!),
        inArray(attendanceEvents.siteId, actor.scope.siteIds!),
        inArray(programs.organizationId, actor.scope.organizationIds!),
      )).orderBy(attendanceExcuses.createdAt).limit(100);
    if (!rows.length) return { excuses: [] };
    const events = await db.select({
      id: attendanceEvents.id, studentProfileId: attendanceEvents.studentProfileId,
      programId: attendanceEvents.programId, occurrenceKey: attendanceEvents.occurrenceKey,
      status: attendanceEvents.status, recordedAt: attendanceEvents.recordedAt,
    }).from(attendanceEvents).where(and(
      inArray(attendanceEvents.programId, [...new Set(rows.map(r => r.programId))]),
      inArray(attendanceEvents.studentProfileId, [...new Set(rows.map(r => r.studentProfileId))]),
      inArray(attendanceEvents.occurrenceKey, [...new Set(rows.map(r => r.occurrenceKey))]),
    ));
    const effective = new Map(effectiveAttendanceEvents(events).map(r =>
      [[r.studentProfileId, r.programId, r.occurrenceKey].join(":"), r]));
    // Only verified documents are surfaced to reviewers; the download itself
    // re-checks scope, verification and object-key policy server-side.
    const attachmentIds = [...new Set(rows.flatMap(r => r.documentIds))];
    const attachmentRows = attachmentIds.length ? await db.select({
      id: documents.id, fileName: documents.fileName,
    }).from(documents).where(and(
      inArray(documents.id, attachmentIds), isNotNull(documents.verifiedAt))) : [];
    const attachmentNameById = new Map(attachmentRows.map(row => [row.id, row.fileName]));
    return { excuses: rows.map(r => {
      const current = effective.get([r.studentProfileId, r.programId, r.occurrenceKey].join(":"));
      return {
        excuseId: r.excuseId, attendanceEventId: r.attendanceEventId,
        currentAttendanceEventId: current?.id ?? null,
        studentName: r.preferredName ?? r.legalFirstName + " " + r.legalLastName,
        expectedAt: r.expectedAt.toISOString(), eventStatus: current?.status ?? r.eventStatus,
        reason: r.reason, submittedAt: r.submittedAt.toISOString(),
        attachments: r.documentIds
          .filter(id => attachmentNameById.has(id))
          .map(id => ({ documentId: id, fileName: attachmentNameById.get(id)! })),
        canReview: current?.id === r.attendanceEventId &&
          (current?.status === "absent" || current?.status === "tardy"),
        canClose: actor.role === "registrar" && !!current && current.id !== r.attendanceEventId,
      };
    }) };
  });

export const closeStaleAttendanceExcuse = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    excuseId: uuid, expectedCurrentEventId: uuid,
    reason: z.string().trim().min(10).max(2000), confirmed: z.literal(true),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await staff("attendance.excuse.review");
    if (actor.role !== "registrar") throw new AuthorizationError("registrar obsolete excuse closure");
    return closeObsoleteAttendanceExcuse(actor, data);
  });

export const reviewCurrentAttendanceExcuse = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    excuseId: uuid, decision: z.enum(["approved", "rejected"]),
    note: z.string().max(2000).optional(),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await staff("attendance.excuse.review");
    const [record] = await db.select({
      attendanceEventId: attendanceExcuses.attendanceEventId,
      status: attendanceExcuses.status,
      programId: attendanceEvents.programId, siteId: attendanceEvents.siteId,
      sectionId: attendanceEvents.sectionId,
      studentProfileId: attendanceEvents.studentProfileId,
      occurrenceKey: attendanceEvents.occurrenceKey,
    }).from(attendanceExcuses)
      .innerJoin(attendanceEvents, eq(attendanceEvents.id, attendanceExcuses.attendanceEventId))
      .where(eq(attendanceExcuses.id, data.excuseId)).limit(1);
    if (!record || !record.siteId || !actor.scope.siteIds?.includes(record.siteId) ||
      !actor.scope.programIds?.includes(record.programId))
      throw new AuthorizationError("pending excuse and site/program grant");
    const [host] = await db.select({ organizationId: programs.organizationId })
      .from(programs).where(eq(programs.id, record.programId)).limit(1);
    if (!host || !actor.scope.organizationIds?.includes(host.organizationId))
      throw new AuthorizationError("excuse organization scope");
    if (actor.role === "teacher") {
      const [assignment] = record.sectionId ? await db.select({ id: sectionTeachers.id })
        .from(sectionTeachers).where(and(
          eq(sectionTeachers.sectionId, record.sectionId),
          eq(sectionTeachers.personId, actor.actorPersonId!))).limit(1) : [];
      if (!assignment) throw new AuthorizationError("teacher excuse section assignment");
    }
    // The stale-attendance guard applies only to a first decision; an
    // already-reviewed excuse falls through to the service's idempotent retry.
    if (record.status === "submitted") {
      const chain = await db.select({
        id: attendanceEvents.id, studentProfileId: attendanceEvents.studentProfileId,
        programId: attendanceEvents.programId, occurrenceKey: attendanceEvents.occurrenceKey,
        status: attendanceEvents.status, recordedAt: attendanceEvents.recordedAt,
      }).from(attendanceEvents).where(and(
        eq(attendanceEvents.studentProfileId, record.studentProfileId),
        eq(attendanceEvents.programId, record.programId),
        eq(attendanceEvents.occurrenceKey, record.occurrenceKey)));
      const [current] = effectiveAttendanceEvents(chain);
      if (!current || current.id !== record.attendanceEventId ||
        !["absent", "tardy"].includes(current.status))
        throw new Error("Attendance changed after the guardian's excuse. Reconcile the school mark before reviewing this excuse");
    }
    return reviewAttendanceExcuse(actor, {
      excuseId: data.excuseId, decision: data.decision,
      reviewNote: data.note?.trim() || undefined,
    });
  });

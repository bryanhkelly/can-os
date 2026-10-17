import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  attendanceEvents, attendanceExcuses, enrollments, guardianRelationships,
  people, programs, sections, sectionTeachers, schoolYears, sites, studentProfiles, terms,
} from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { effectiveAttendanceEvents } from "@/domain/effective-attendance";
import { siteDate } from "@/domain/expected-attendance";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { loadExpectedAttendanceCoverage } from "./expected-attendance-queries";
import { recordAttendanceRevision, submitAttendanceExcuse, reviewAttendanceExcuse } from "./attendance-service";

const uuid = z.string().uuid();
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + "T12:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Invalid school date");
const occurrence = (date: string) => date + ":site-day";

async function staff(capability: string) {
  const actor = await getCommandContext(getRequest());
  assertCapability(actor, capability);
  if (!actor.actorPersonId || !["registrar", "teacher"].includes(actor.role) ||
      !actor.scope.programIds?.length || !actor.scope.siteIds?.length ||
      !actor.scope.organizationIds?.length)
    throw new AuthorizationError("verified attendance staff grant");
  return actor;
}
async function guardian() {
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

async function scopedOnsitePrograms(actor: Awaited<ReturnType<typeof staff>>, selectedId?: string) {
  const rows = await db.select({
    id: programs.id, name: programs.name, organizationId: programs.organizationId,
    siteId: programs.siteId, deliveryModel: programs.deliveryModel,
    timezone: sites.timezone,
  }).from(programs).innerJoin(sites, eq(sites.id, programs.siteId))
    .where(and(
      inArray(programs.id, actor.scope.programIds!),
      inArray(programs.organizationId, actor.scope.organizationIds!),
      inArray(programs.siteId, actor.scope.siteIds!),
      ...(selectedId ? [eq(programs.id, selectedId)] : []),
    ));
  return rows.filter(p => p.deliveryModel.onsite === true);
}

/** One server-authorized program/student/date entitlement, used for reads and writes. */
async function resolveExpectedRoster(actor: Awaited<ReturnType<typeof staff>>,
  date: string, programId?: string, studentId?: string) {
  const programsAtSite = await scopedOnsitePrograms(actor, programId);
  const expectedIds = new Map<string, Set<string>>();
  const coverage = await loadExpectedAttendanceCoverage(programsAtSite, [], new Date(), 1,
    { date, studentIds: expectedIds });
  const activePrograms = programsAtSite.filter(p => siteDate(new Date(), p.timezone) >= date);

  // A registrar can manage a program roster. A teacher can only mark a
  // student in an active section they are actually assigned to teach.
  const permittedIds = activePrograms.map(p => p.id);
  if (!permittedIds.length) return { roster: [], coverage, programsAtSite };

  const programRoster = actor.role === "registrar" ? await db.select({
    studentProfileId: enrollments.studentProfileId, programId: enrollments.programId,
    preferredName: people.preferredName, firstName: people.legalFirstName,
    lastName: people.legalLastName,
  }).from(enrollments)
    .innerJoin(studentProfiles, eq(studentProfiles.id, enrollments.studentProfileId))
    .innerJoin(people, eq(people.id, studentProfiles.personId))
    .where(and(eq(enrollments.kind, "program"), eq(enrollments.status, "active"),
      inArray(enrollments.programId, permittedIds),
      ...(studentId ? [eq(enrollments.studentProfileId, studentId)] : []))) : [];

  const sectionsAtSite = await db.select({
    studentProfileId: enrollments.studentProfileId, programId: sections.programId,
    siteId: sections.siteId, sectionId: sections.id, sectionTitle: sections.title,
    preferredName: people.preferredName, firstName: people.legalFirstName,
    lastName: people.legalLastName,
  }).from(enrollments)
    .innerJoin(sections, eq(sections.id, enrollments.sectionId))
    .innerJoin(terms, eq(terms.id, sections.termId))
    .innerJoin(schoolYears, eq(schoolYears.id, terms.schoolYearId))
    .innerJoin(studentProfiles, eq(studentProfiles.id, enrollments.studentProfileId))
    .innerJoin(people, eq(people.id, studentProfiles.personId))
    .innerJoin(sectionTeachers, eq(sectionTeachers.sectionId, sections.id))
    .where(and(eq(enrollments.kind, "section"), eq(enrollments.status, "active"),
      eq(sections.active, true), eq(schoolYears.status, "active"),
      lte(schoolYears.startsOn, date), gte(schoolYears.endsOn, date),
      inArray(sections.programId, permittedIds),
      inArray(sections.siteId, actor.scope.siteIds!),
      ...(actor.role === "teacher" ? [eq(sectionTeachers.personId, actor.actorPersonId!)] :
        []),
      ...(studentId ? [eq(enrollments.studentProfileId, studentId)] : [])));
  const byKey = new Map<string, {
    studentProfileId: string; programId: string; studentName: string;
    sectionTitle: string | null; siteId: string; sectionId: string | null;
  }>();
  for (const row of programRoster) {
    if (!row.programId || !expectedIds.get(row.programId)?.has(row.studentProfileId)) continue;
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
  return { roster: [...byKey.values()], coverage, programsAtSite };
}

export const listExpectedOnsiteRoster = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({
    date: dateField, programId: uuid.optional(),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await staff("attendance.write");
    const { roster, coverage, programsAtSite } = await resolveExpectedRoster(actor,
      data.date, data.programId);
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
          occurrenceKey: occurrence(data.date),
          attendanceEventId: record?.id ?? null,
          status: record?.status ?? "unmarked",
        };
      }).sort((a, b) => a.studentName.localeCompare(b.studentName) ||
        a.programName.localeCompare(b.programName)),
    };
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
      .where(and(eq(guardianRelationships.guardianPersonId, actor.actorPersonId!),
        eq(guardianRelationships.canViewAcademics, true),
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
          const excuse = excuses.find(e => history.some(r => r.id === e.attendanceEventId));
          const eventId = excuse?.attendanceEventId ?? f.id;
          return {
            attendanceEventId: eventId,
            studentPersonId: profileToPerson.get(f.studentProfileId) ?? "",
            studentName: nameByPerson.get(profileToPerson.get(f.studentProfileId) ?? "") ?? "Student",
            expectedAt: f.expectedAt.toISOString(),
            status: f.status, originalStatus: earliest.status,
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
        eq(guardianRelationships.guardianPersonId, actor.actorPersonId!),
        eq(guardianRelationships.studentPersonId, profile.personId),
        eq(guardianRelationships.canViewAcademics, true),
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
    ));
    const effective = new Map(effectiveAttendanceEvents(events).map(r =>
      [[r.studentProfileId, r.programId, r.occurrenceKey].join(":"), r]));
    return { excuses: rows.map(r => {
      const current = effective.get([r.studentProfileId, r.programId, r.occurrenceKey].join(":"));
      return {
        excuseId: r.excuseId, attendanceEventId: r.attendanceEventId,
        studentName: r.preferredName ?? r.legalFirstName + " " + r.legalLastName,
        expectedAt: r.expectedAt.toISOString(), eventStatus: current?.status ?? r.eventStatus,
        reason: r.reason, submittedAt: r.submittedAt.toISOString(),
        canReview: current?.id === r.attendanceEventId &&
          (current?.status === "absent" || current?.status === "tardy"),
      };
    }) };
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
      programId: attendanceEvents.programId, siteId: attendanceEvents.siteId,
      sectionId: attendanceEvents.sectionId,
      studentProfileId: attendanceEvents.studentProfileId,
      occurrenceKey: attendanceEvents.occurrenceKey,
    }).from(attendanceExcuses)
      .innerJoin(attendanceEvents, eq(attendanceEvents.id, attendanceExcuses.attendanceEventId))
      .where(and(eq(attendanceExcuses.id, data.excuseId),
        eq(attendanceExcuses.status, "submitted"))).limit(1);
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
    return reviewAttendanceExcuse(actor, {
      excuseId: data.excuseId, decision: data.decision,
      reviewNote: data.note?.trim() || undefined,
    });
  });

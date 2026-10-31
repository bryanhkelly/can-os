import { createServerFn } from "@tanstack/react-start";
import { getRequest,setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { and, asc, eq, inArray, gte, lt, ne, isNull, notExists, or } from "drizzle-orm";
import { db } from "@/db/client";
import { actions, calendarEvents, calendarEventParticipants, enrollments, organizations, people, programs, scheduledOccurrences, sites } from "@/db/schema";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { loadOnsiteDayOperationalSnapshot } from "@/modules/operations/onsite-day-review.functions";
import { AuthorizationError } from "@/domain/command-context";
import { buildDailyOperationsAttention } from "@/domain/daily-operations";
import { readFullFlowOperations } from "./full-flow-dashboard.server";
import { getSchoolOperationsCommandCenter } from "./command-center-service";
import { listOpeningHandoffs,listOpeningOperators } from "@/modules/programs/opening-handoff.server";
import { openingHandoffManagerCapability } from "@/modules/programs/opening-handoff.server";
import { hasInstitutionalProgramCapability } from "@/modules/identity/institutional-capability.server";
import { readLocalSchoolOpeningStatus } from "@/modules/operations/school-opening.server";
import type { Actor } from "@/modules/identity/actors.server";

const requestSchema = z.object({ siteId: z.string().uuid() });
const openStatuses = ["open", "in_progress", "waiting"] as const;

/** Site Today is a scoped read model, never another source of school state. */
export const getSiteToday = createServerFn({ method: "GET" })
  .validator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data }) => {
    const actor = await getCommandContext(getRequest());
    if (!actor.actorPersonId || !["registrar","site_leader"].includes(actor.role) ||
        !actor.scope.siteIds?.includes(data.siteId)) {
      throw new AuthorizationError("site.today.read");
    }
    const [site] = await db.select({
      id: sites.id, name: sites.name, timezone: sites.timezone,
      organizationId: sites.organizationId, organizationName: organizations.name,
    }).from(sites).innerJoin(organizations, eq(organizations.id, sites.organizationId))
      .where(eq(sites.id, data.siteId)).limit(1);
    if (!site || !actor.scope.organizationIds?.includes(site.organizationId)) {
      throw new AuthorizationError("site.today.read");
    }
    setResponseHeader("Cache-Control","private, no-store");

    const visiblePrograms = await db.select({
      id: programs.id, name: programs.name, status: programs.status,
      type: programs.type, gradeRange: programs.gradeRange,
    }).from(programs).where(eq(programs.siteId, site.id)).orderBy(asc(programs.name));
    const permitted = new Set(actor.scope.programIds ?? []);
    const scopedPrograms = visiblePrograms.filter(p => permitted.has(p.id));
    const programIds = scopedPrograms.map(p => p.id);
    const handoffs=await listOpeningHandoffs(programIds);
    const openingOperators=await listOpeningOperators({organizationId:site.organizationId,siteId:site.id});
    const canReceive=openingOperators.some(operator=>operator.personId===actor.actorPersonId);
    const managerPrograms=new Set<string>();
    for(const program of scopedPrograms){
      if(await hasInstitutionalProgramCapability({...actor,actorPersonId:actor.actorPersonId} satisfies Actor,
        {...program,organizationId:site.organizationId,siteId:site.id},openingHandoffManagerCapability))
        managerPrograms.add(program.id);
    }
    // Independently hosted church/CAN schools: surface the current opening
    // authorization state (status + non-sensitive blocker categories only) so
    // a suspension or lapsed prerequisite is visible beside the live school
    // day. Registrars use the full school-opening desk instead; programs
    // without an independent church/CAN identity produce no entry.
    const schoolOpenings=[];
    for(const program of scopedPrograms){
      try{
        schoolOpenings.push(await readLocalSchoolOpeningStatus(actor,program.id));
      }catch(error){
        if(!(error instanceof AuthorizationError))throw error;
      }
    }
    // Site-local day boundaries, including daylight-saving transitions.
    const now = new Date();
    const dayText = new Intl.DateTimeFormat("en-CA", {
      timeZone: site.timezone, year: "numeric", month: "2-digit", day: "2-digit"
    }).format(now);
    // Filter calendar records using an intentionally broad UTC query range, then
    // perform exact site-local date matching. This avoids guessing a fixed offset.
    const start = new Date(now.getTime() - 36 * 60 * 60 * 1000);
    const end = new Date(now.getTime() + 36 * 60 * 60 * 1000);
    const localDate = (value: Date) => new Intl.DateTimeFormat("en-CA", {
      timeZone: site.timezone, year: "numeric", month: "2-digit", day: "2-digit"
    }).format(value);
    // Site Today is a shared screen: exclude private calendar entries, section-only
    // events, and events with an explicit participant audience.
    const hasParticipants = db.select({id:calendarEventParticipants.id})
      .from(calendarEventParticipants)
      .where(eq(calendarEventParticipants.calendarEventId,calendarEvents.id));
    const [actionRows, eventRows, enrolledRows, snapshot] = await Promise.all([
      db.select({
        id: actions.id, title: actions.title, description: actions.description,
        priority: actions.priority, status: actions.status, dueAt: actions.dueAt,
        createdAt: actions.createdAt, ownerPersonId: actions.ownerPersonId,
        ownerFirstName: people.legalFirstName, ownerLastName: people.legalLastName,
        programId: actions.programId, siteId: actions.siteId, type: actions.type,
      }).from(actions).leftJoin(people,eq(people.id,actions.ownerPersonId))
        .where(and(eq(actions.siteId, site.id), inArray(actions.status, [...openStatuses]),
          or(isNull(actions.programId),inArray(actions.programId,programIds))))
        .orderBy(asc(actions.dueAt)).limit(100),
      db.select({
        id: calendarEvents.id, title: calendarEvents.title, type: calendarEvents.type,
        startsAt: scheduledOccurrences.startsAt, endsAt: scheduledOccurrences.endsAt,
        programId: scheduledOccurrences.programId,
      }).from(calendarEvents)
        .innerJoin(scheduledOccurrences, eq(calendarEvents.scheduledOccurrenceId, scheduledOccurrences.id))
        .where(and(eq(scheduledOccurrences.siteId, site.id), gte(scheduledOccurrences.startsAt, start),
          lt(scheduledOccurrences.startsAt, end),isNull(scheduledOccurrences.sectionId),
          ne(calendarEvents.type,"personal"),ne(calendarEvents.type,"study_group"),notExists(hasParticipants),
          programIds.length ? or(isNull(scheduledOccurrences.programId),inArray(scheduledOccurrences.programId,programIds)) : isNull(scheduledOccurrences.programId)))
        .orderBy(asc(scheduledOccurrences.startsAt)).limit(200),
      programIds.length ? db.select({
        studentProfileId: enrollments.studentProfileId, programId: enrollments.programId,
      }).from(enrollments).where(and(inArray(enrollments.programId, programIds),
        eq(enrollments.status, "active"), ne(enrollments.kind, "section"))) : Promise.resolve([]),
      loadOnsiteDayOperationalSnapshot(actor,site,dayText),
    ]);

    const filteredActions = actionRows.filter(row => !row.programId || permitted.has(row.programId));
    const serializedActions = filteredActions.map(row => ({
      ...row,
      ownerName: row.ownerFirstName && row.ownerLastName ? `${row.ownerFirstName} ${row.ownerLastName}` : null,
      createdAt: row.createdAt.toISOString(),
      dueAt: row.dueAt?.toISOString() ?? null,
    }));
    // Only registrars receive student-free admissions and academic aggregates.
    // A local church/site leader keeps opening, staffing and assigned work,
    // without gaining broad family, document or intervention visibility.
    const operationalActor = actor.role === "registrar" ? {...actor,scope:{...actor.scope,
      siteIds:[site.id],programIds}} : null;
    const [operationalRecord,staffingRecord] = operationalActor ? await Promise.all([
      readFullFlowOperations(operationalActor),
      getSchoolOperationsCommandCenter(operationalActor),
    ]) : [null,null];
    const attentionItems = buildDailyOperationsAttention({
      role: actor.role as "registrar"|"site_leader",
      actorPersonId: actor.actorPersonId,
      actions: serializedActions.map(action => ({...action,
        priority: action.priority === "urgent" ? "critical" : action.priority === "low" ? "normal" : action.priority,
      })),
      staffingIssues: staffingRecord?.issues ?? [],
      programs: operationalRecord?.programs ?? [],
    });
    const todayEvents = eventRows.filter(row =>
      (!row.programId || permitted.has(row.programId)) && localDate(row.startsAt) === dayText);
    // Only effective staff-observed onsite day marks count as physical attendance.
    const observations = snapshot.operational.students.filter(row=>
      !["unmarked","expected"].includes(row.status));
    const enrollmentCount = new Set(enrolledRows.map(row => row.studentProfileId)).size;
    return {
      site, asOf: now.toISOString(), localDate: dayText,
      canOpenOnsiteDay:actor.role==="site_leader",
      viewerPersonId:actor.actorPersonId,
      schoolDay:snapshot.operational,
      programs: scopedPrograms,
      schoolOpenings,
      attentionItems,
      openingHandoffs:handoffs.map(row=>({...row,createdAt:row.createdAt.toISOString(),
        resolvedAt:row.resolvedAt?.toISOString()??null,
        recipientEligible:openingOperators.some(operator=>operator.personId===row.ownerPersonId),
        replacementOperators:row.status==="open"&&row.programId&&managerPrograms.has(row.programId)&&
          !openingOperators.some(operator=>operator.personId===row.ownerPersonId)&&
          scopedPrograms.some(program=>program.id===row.programId&&program.status==="active")?openingOperators:[],
        canAcknowledge:canReceive&&row.ownerPersonId===actor.actorPersonId&&row.status==="open"&&
          scopedPrograms.some(program=>program.id===row.programId&&program.status==="active"),
      })),
      enrollment: { count: enrollmentCount, note: "Distinct students in active non-section program enrollments" },
      attendance: {
        count: observations.length,
        present: observations.filter(row => row.status === "present").length,
        absent: observations.filter(row => row.status === "absent").length,
        tardy: observations.filter(row => row.status === "tardy").length,
        note: "Effective staff-observed onsite marks per scheduled student-program entry; virtual learning is excluded",
      },
      actions: serializedActions,
      events: todayEvents.map(row => ({
        ...row, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt?.toISOString() ?? null,
      })),
    };
  });

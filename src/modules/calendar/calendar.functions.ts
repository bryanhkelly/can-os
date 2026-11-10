import { hasRegistrarAuthority } from "@/domain/school-roles";
import { AuthorizationError } from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { personDisplayName } from "@/domain/person-name";
import { EventTypes } from "@/domain/event-types";
import { actorSiteIds,recordAudit,requireActor,type ActorRole } from "@/modules/identity/actors.server";
import { emitEvent, notifyMany } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and,asc,eq,gt,gte,inArray,isNull,lt,lte,ne,notExists,or,sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { reviseCalendarEventForActor } from "./calendar-events.server";
import { visibleStudyGroupCalendarEventIds } from "./group-calendar-visibility.server";
import { activeFacilitatorSectionIds } from "@/modules/operations/site-section-facilitators.server";
import { SECTION_MEETING_PERIOD_TYPES } from "@/domain/schedule-period-types";
import { addCalendarDays, dateTimeInputInTimezone, isValidTimeZone } from "./timezone";
import { eligibleStudent, participatingStudent } from "@/modules/study-groups/canonical-membership.server";

const allRoles: readonly ActorRole[] = ["student", "teacher", "guardian", "registrar", "specialist", "counselor"];
const calendarReadRoles: readonly ActorRole[] = [...allRoles, "room_facilitator"];

export type CalendarFeedItem = {
  id: string;
  title: string;
  type: string;
  source: "site" | "section" | "personal" | "assessment" | "study_group";
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  description: string | null;
  cancelled: boolean;
  manageable: boolean;
  sectionId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  /** Group behind a study-group session, readable only because this event is already visible to the actor. */
  studyGroup?: { id: string; title: string } | null;
  teachers?: { personId: string; name: string }[];
  teacherNames?: string[];
  guardianStudents?: { studentPersonId: string; studentName: string }[];
};

type Schema = typeof import("@/db/schema");

/** Section ids the actor may read: enrolled (student), taught (teacher), related students (guardian). */
async function visibleSectionIds(db: typeof import("@/db/client").db, schema: Schema, actor: Awaited<ReturnType<typeof requireActor>>, sites: string[], guardianStudents: Map<string, NonNullable<CalendarFeedItem["guardianStudents"]>>): Promise<string[]> {
  if (actor.role === "student") {
    const rows = await db
      .select({ sectionId: schema.enrollments.sectionId })
      .from(schema.studentProfiles)
      .innerJoin(schema.enrollments, eq(schema.enrollments.studentProfileId, schema.studentProfiles.id))
      .innerJoin(schema.sections, eq(schema.sections.id, schema.enrollments.sectionId))
      .where(and(
        eq(schema.studentProfiles.personId, actor.actorPersonId),
        eq(schema.enrollments.status, "active"),
        eq(schema.enrollments.kind, "section"),
        inArray(schema.sections.siteId, sites),
        inArray(schema.sections.programId, actor.scope.programIds ?? []),
      ));
    return rows.map((row) => row.sectionId).filter((id): id is string => Boolean(id));
  }
  if (actor.role === "teacher") {
    const { accessibleClasses } = await import("@/modules/learning/class-access.server");
    return (await accessibleClasses(actor)).map(section=>section.id);
  }
  if (actor.role === "guardian") {
    const rows = await db
      .select({ sectionId: schema.enrollments.sectionId,
        studentPersonId: schema.studentProfiles.personId,
        legalFirstName: schema.people.legalFirstName, legalLastName: schema.people.legalLastName,
        preferredName: schema.people.preferredName })
      .from(schema.guardianRelationships)
      .innerJoin(schema.studentProfiles, eq(schema.studentProfiles.personId, schema.guardianRelationships.studentPersonId))
      .innerJoin(schema.people, eq(schema.people.id, schema.studentProfiles.personId))
      .innerJoin(schema.enrollments, and(
        eq(schema.enrollments.studentProfileId, schema.studentProfiles.id),
        eq(schema.enrollments.status, "active"),
        eq(schema.enrollments.kind, "section"),
      ))
      .innerJoin(schema.sections, eq(schema.sections.id, schema.enrollments.sectionId))
      .where(and(
        guardianRelationshipPredicate({
          guardianPersonId: actor.actorPersonId,
          access: "academic",
        }),
        inArray(schema.enrollments.programId, actor.scope.programIds ?? []),
        inArray(schema.sections.siteId, sites),
        inArray(schema.sections.programId, actor.scope.programIds ?? []),
      ));
    for (const row of rows) {
      if (!row.sectionId) continue;
      const students = guardianStudents.get(row.sectionId) ?? [];
      if (!students.some(student => student.studentPersonId === row.studentPersonId)) {
        students.push({ studentPersonId: row.studentPersonId, studentName: personDisplayName(row) });
      }
      guardianStudents.set(row.sectionId, students);
    }
    return [...guardianStudents.keys()];
  }
  if (actor.role === "room_facilitator") {
    return (await Promise.all((actor.scope.programIds ?? []).map(programId =>
      activeFacilitatorSectionIds(db, actor, programId)))).flat();
  }
  return [];
}

/** Recurring class meeting times projected from each visible Section's active
 * schedule template and the latest active academic calendar's instructional
 * days — the same canonical schedule identity used by onsite room planning.
 * This is a read-only derivation; no calendar events are materialized. */
async function sectionClassTimes(
  db: typeof import("@/db/client").db,
  schema: Schema,
  sectionIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<{ items: CalendarFeedItem[]; truncated: boolean }> {
  if (!sectionIds.length) return { items: [], truncated: false };
  // Local calendar dates can sit up to a day on either side of the UTC window.
  const minDate = addCalendarDays(rangeStart.toISOString().slice(0, 10), -1);
  const maxDate = addCalendarDays(rangeEnd.toISOString().slice(0, 10), 1);
  const newerCalendar = alias(schema.academicCalendars, "newer_class_time_calendar");
  const onDate = schema.academicCalendarDays.calendarDate;
  const rows = await db
    .select({
      sectionId: schema.sections.id,
      sectionTitle: schema.sections.title,
      periodId: schema.scheduleTemplatePeriods.id,
      periodLabel: schema.scheduleTemplatePeriods.label,
      startsAtLocal: schema.scheduleTemplatePeriods.startsAtLocal,
      endsAtLocal: schema.scheduleTemplatePeriods.endsAtLocal,
      calendarDate: onDate,
      timezone: schema.schoolYears.timezone,
    })
    .from(schema.sections)
    .innerJoin(schema.terms, eq(schema.terms.id, schema.sections.termId))
    .innerJoin(schema.schoolYears, eq(schema.schoolYears.id, schema.terms.schoolYearId))
    .innerJoin(schema.scheduleTemplates, eq(schema.scheduleTemplates.id, schema.sections.scheduleTemplateId))
    .innerJoin(schema.scheduleTemplatePeriods,
      eq(schema.scheduleTemplatePeriods.scheduleTemplateId, schema.scheduleTemplates.id))
    .innerJoin(schema.academicCalendars, and(
      eq(schema.academicCalendars.schoolYearId, schema.schoolYears.id),
      eq(schema.academicCalendars.siteId, schema.schoolYears.siteId),
      eq(schema.academicCalendars.active, true),
    ))
    .innerJoin(schema.academicCalendarDays,
      eq(schema.academicCalendarDays.academicCalendarId, schema.academicCalendars.id))
    .where(and(
      inArray(schema.sections.id, sectionIds),
      eq(schema.sections.active, true),
      eq(schema.sections.siteId, schema.schoolYears.siteId),
      eq(schema.schoolYears.status, "active"),
      eq(schema.scheduleTemplates.schoolYearId, schema.schoolYears.id),
      eq(schema.scheduleTemplates.siteId, schema.schoolYears.siteId),
      or(eq(schema.scheduleTemplates.programId, schema.sections.programId),
        isNull(schema.scheduleTemplates.programId)),
      eq(schema.scheduleTemplates.active, true),
      inArray(schema.scheduleTemplatePeriods.type, [...SECTION_MEETING_PERIOD_TYPES]),
      gte(onDate, minDate), lte(onDate, maxDate),
      lte(schema.schoolYears.startsOn, onDate), gte(schema.schoolYears.endsOn, onDate),
      lte(schema.terms.startsOn, onDate), gte(schema.terms.endsOn, onDate),
      lte(schema.scheduleTemplates.effectiveFrom, onDate),
      or(isNull(schema.scheduleTemplates.effectiveThrough),
        gte(schema.scheduleTemplates.effectiveThrough, onDate)),
      sql`${schema.scheduleTemplatePeriods.dayOfWeek} = extract(dow from ${onDate})::int`,
      or(eq(schema.academicCalendarDays.type, "instructional"),
        and(eq(schema.academicCalendarDays.type, "special"),
          sql`${schema.academicCalendarDays.instructionalMinutes} > 0`)),
      notExists(db.select({ id: newerCalendar.id }).from(newerCalendar).where(and(
        eq(newerCalendar.schoolYearId, schema.schoolYears.id),
        eq(newerCalendar.siteId, schema.schoolYears.siteId),
        eq(newerCalendar.active, true),
        gt(newerCalendar.version, schema.academicCalendars.version),
      ))),
    ))
    .orderBy(asc(onDate), asc(schema.scheduleTemplatePeriods.startsAtLocal))
    .limit(501);

  const items: CalendarFeedItem[] = [];
  for (const row of rows.slice(0, 500)) {
    if (row.startsAtLocal >= row.endsAtLocal) continue;
    let startsAt: string;
    let endsAt: string;
    try {
      startsAt = dateTimeInputInTimezone(`${row.calendarDate}T${row.startsAtLocal.slice(0, 5)}`, row.timezone);
      endsAt = dateTimeInputInTimezone(`${row.calendarDate}T${row.endsAtLocal.slice(0, 5)}`, row.timezone);
    } catch {
      continue; // A DST transition can skip this local class time entirely.
    }
    if (new Date(endsAt) <= rangeStart || new Date(startsAt) >= rangeEnd) continue;
    items.push({
      id: `class:${row.sectionId}:${row.periodId}:${row.calendarDate}`,
      title: row.sectionTitle,
      type: "class_time",
      source: "section",
      startsAt,
      endsAt,
      timezone: row.timezone,
      description: row.periodLabel,
      cancelled: false,
      manageable: false,
      sectionId: row.sectionId,
    });
  }
  return { items, truncated: rows.length > 500 };
}

/** Weekly chapel gatherings projected site-wide from active schedule
 * templates, exactly like class times: a read-only derivation against the
 * latest active academic calendar's instructional days; no calendar events
 * are materialized. Chapel is a whole-site gathering, so visibility follows
 * site scope (program-scoped templates stay within the actor's programs) and
 * identical times declared on several templates render once. */
async function siteChapelTimes(
  db: typeof import("@/db/client").db,
  schema: Schema,
  sites: string[],
  programIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<{ items: CalendarFeedItem[]; truncated: boolean }> {
  if (!sites.length) return { items: [], truncated: false };
  const minDate = addCalendarDays(rangeStart.toISOString().slice(0, 10), -1);
  const maxDate = addCalendarDays(rangeEnd.toISOString().slice(0, 10), 1);
  const newerCalendar = alias(schema.academicCalendars, "newer_chapel_calendar");
  const onDate = schema.academicCalendarDays.calendarDate;
  const rows = await db
    .select({
      periodId: schema.scheduleTemplatePeriods.id,
      periodLabel: schema.scheduleTemplatePeriods.label,
      startsAtLocal: schema.scheduleTemplatePeriods.startsAtLocal,
      endsAtLocal: schema.scheduleTemplatePeriods.endsAtLocal,
      calendarDate: onDate,
      timezone: schema.schoolYears.timezone,
      siteId: schema.schoolYears.siteId,
    })
    .from(schema.scheduleTemplates)
    .innerJoin(schema.schoolYears, eq(schema.schoolYears.id, schema.scheduleTemplates.schoolYearId))
    .innerJoin(schema.scheduleTemplatePeriods,
      eq(schema.scheduleTemplatePeriods.scheduleTemplateId, schema.scheduleTemplates.id))
    .innerJoin(schema.academicCalendars, and(
      eq(schema.academicCalendars.schoolYearId, schema.schoolYears.id),
      eq(schema.academicCalendars.siteId, schema.schoolYears.siteId),
      eq(schema.academicCalendars.active, true),
    ))
    .innerJoin(schema.academicCalendarDays,
      eq(schema.academicCalendarDays.academicCalendarId, schema.academicCalendars.id))
    .where(and(
      inArray(schema.schoolYears.siteId, sites),
      eq(schema.schoolYears.status, "active"),
      eq(schema.scheduleTemplates.siteId, schema.schoolYears.siteId),
      or(isNull(schema.scheduleTemplates.programId),
        inArray(schema.scheduleTemplates.programId, programIds)),
      eq(schema.scheduleTemplates.active, true),
      eq(schema.scheduleTemplatePeriods.type, "chapel"),
      gte(onDate, minDate), lte(onDate, maxDate),
      lte(schema.schoolYears.startsOn, onDate), gte(schema.schoolYears.endsOn, onDate),
      lte(schema.scheduleTemplates.effectiveFrom, onDate),
      or(isNull(schema.scheduleTemplates.effectiveThrough),
        gte(schema.scheduleTemplates.effectiveThrough, onDate)),
      sql`${schema.scheduleTemplatePeriods.dayOfWeek} = extract(dow from ${onDate})::int`,
      or(eq(schema.academicCalendarDays.type, "instructional"),
        and(eq(schema.academicCalendarDays.type, "special"),
          sql`${schema.academicCalendarDays.instructionalMinutes} > 0`)),
      notExists(db.select({ id: newerCalendar.id }).from(newerCalendar).where(and(
        eq(newerCalendar.schoolYearId, schema.schoolYears.id),
        eq(newerCalendar.siteId, schema.schoolYears.siteId),
        eq(newerCalendar.active, true),
        gt(newerCalendar.version, schema.academicCalendars.version),
      ))),
    ))
    .orderBy(asc(onDate), asc(schema.scheduleTemplatePeriods.startsAtLocal))
    .limit(501);

  const items: CalendarFeedItem[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(0, 500)) {
    if (row.startsAtLocal >= row.endsAtLocal) continue;
    const gathering = `${row.siteId}:${row.calendarDate}:${row.startsAtLocal}:${row.endsAtLocal}`;
    if (seen.has(gathering)) continue;
    seen.add(gathering);
    let startsAt: string;
    let endsAt: string;
    try {
      startsAt = dateTimeInputInTimezone(`${row.calendarDate}T${row.startsAtLocal.slice(0, 5)}`, row.timezone);
      endsAt = dateTimeInputInTimezone(`${row.calendarDate}T${row.endsAtLocal.slice(0, 5)}`, row.timezone);
    } catch {
      continue; // A DST transition can skip this local gathering time entirely.
    }
    if (new Date(endsAt) <= rangeStart || new Date(startsAt) >= rangeEnd) continue;
    items.push({
      id: `chapel:${row.periodId}:${row.calendarDate}`,
      title: row.periodLabel,
      type: "chapel",
      source: "site",
      startsAt,
      endsAt,
      timezone: row.timezone,
      description: null,
      cancelled: false,
      manageable: false,
    });
  }
  return { items, truncated: rows.length > 500 };
}

async function readCalendarWindow(actor: Awaited<ReturnType<typeof requireActor>>, rangeStart: Date, rangeEnd: Date) {
    setResponseHeader("Cache-Control", "private, no-store");
    const viewerRole = actor.role as ActorRole;
    if (!process.env.DATABASE_URL) return { connected: false, viewerRole, items: [] as CalendarFeedItem[], truncated:false };
    const sites = actor.role === "room_facilitator"
      ? actor.grantSiteId ? [actor.grantSiteId] : []
      : actorSiteIds(actor);
    const [{ db }, schema] = await Promise.all([import("@/db/client"), import("@/db/schema")]);

    const guardianStudents = new Map<string, NonNullable<CalendarFeedItem["guardianStudents"]>>();
    const sectionIds = await visibleSectionIds(db, schema, actor, sites, guardianStudents);
    const visibleStudyGroupEventIds = actor.role === "room_facilitator" ? [] : await visibleStudyGroupCalendarEventIds(
      actor,
      sites,
      sectionIds,
      rangeStart,
      rangeEnd,
    );

    const participantEventIds = db
      .select({ id: schema.calendarEventParticipants.calendarEventId })
      .from(schema.calendarEventParticipants)
      .where(and(
        eq(schema.calendarEventParticipants.participantType, "person"),
        eq(schema.calendarEventParticipants.participantId, actor.actorPersonId),
      ));

    // A site or section membership does not reveal participant-restricted events.
    // Only the named participant can read those events.
    const hasExplicitParticipants = db.select({ id: schema.calendarEventParticipants.id })
      .from(schema.calendarEventParticipants)
      .where(eq(schema.calendarEventParticipants.calendarEventId, schema.calendarEvents.id));
    const events = await db
      .select()
      .from(schema.calendarEvents)
      .innerJoin(
        schema.scheduledOccurrences,
        eq(schema.calendarEvents.scheduledOccurrenceId, schema.scheduledOccurrences.id),
      )
      .where(and(
        or(gte(schema.scheduledOccurrences.startsAt, rangeStart),
          gt(schema.scheduledOccurrences.endsAt, rangeStart)),
        lt(schema.scheduledOccurrences.startsAt, rangeEnd),
        or(
          and(inArray(schema.scheduledOccurrences.siteId, sites),
            isNull(schema.scheduledOccurrences.sectionId),
            or(isNull(schema.scheduledOccurrences.programId),inArray(schema.scheduledOccurrences.programId,actor.scope.programIds??[])),
            ne(schema.calendarEvents.type, "personal"),
            ne(schema.calendarEvents.type, "study_group"),
            notExists(hasExplicitParticipants)),
          sectionIds.length ? and(inArray(schema.scheduledOccurrences.sectionId, sectionIds),
            ne(schema.calendarEvents.type, "study_group"),
            notExists(hasExplicitParticipants)) : undefined,
          actor.role !== "room_facilitator" ? and(
            ne(schema.calendarEvents.type, "study_group"),
            inArray(schema.calendarEvents.id, participantEventIds),
          ) : undefined,
          visibleStudyGroupEventIds.length
            ? inArray(schema.calendarEvents.id, visibleStudyGroupEventIds)
            : undefined,
        ),
      ))
      .orderBy(asc(schema.scheduledOccurrences.startsAt))
      .limit(201);
    const calendarEvents = events.slice(0,200).map(({ calendar_events: event, scheduled_occurrences: occurrence }) => ({
      ...event,
      startsAt: occurrence.startsAt,
      endsAt: occurrence.endsAt,
      timezone: occurrence.timezone,
      organizationId: occurrence.organizationId,
      siteId: occurrence.siteId,
      programId: occurrence.programId,
      sectionId: occurrence.sectionId,
    }));

    const eventIds = calendarEvents.map((event) => event.id);
    const ownedEventIds = new Set(
      eventIds.length
        ? (
            await db
              .select({ calendarEventId: schema.calendarEventParticipants.calendarEventId })
              .from(schema.calendarEventParticipants)
              .where(and(
                inArray(schema.calendarEventParticipants.calendarEventId, eventIds),
                eq(schema.calendarEventParticipants.participantType, "person"),
                eq(schema.calendarEventParticipants.participantId, actor.actorPersonId),
                eq(schema.calendarEventParticipants.role, "owner"),
              ))
          ).map((row) => row.calendarEventId)
        : [],
    );
    const canManageStaff = actor.capabilities.has("calendar.event.manage");

    const items: CalendarFeedItem[] = calendarEvents.map((event) => {
      const cancelled = event.metadata.cancelled === true;
      const manageable = !cancelled && !event.sourceType && (
        event.type === "personal"
          ? ownedEventIds.has(event.id)
          : canManageStaff && (
              hasRegistrarAuthority(actor.role)
                ? Boolean(event.siteId) && sites.includes(event.siteId!) &&
                  (!event.programId || (actor.scope.programIds ?? []).includes(event.programId))
                : actor.role === "teacher"
                  ? Boolean(event.sectionId) && sectionIds.includes(event.sectionId!)
                  : false
            )
      );
      return {
        id: event.id,
        title: event.title,
        type: event.type,
        source: event.type === "personal" ? "personal"
          : event.type === "study_group" ? "study_group"
          : event.sectionId ? "section" : "site",
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt ? event.endsAt.toISOString() : null,
        timezone: event.timezone,
        description: event.description,
        cancelled,
        manageable,
        sectionId: event.sectionId,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
      };
    });

    const classTimes = await sectionClassTimes(db, schema, sectionIds, rangeStart, rangeEnd);
    items.push(...classTimes.items);

    // Link visible study-group sessions to their owning group so the event
    // detail can open the group's record page by name.
    const studyGroupSessionIds = [...new Set(items
      .filter(item => item.source === "study_group" &&
        item.sourceType === "study_group_session" && item.sourceId)
      .map(item => item.sourceId!))];
    if (studyGroupSessionIds.length) {
      const sessionGroups = await db.select({
        sessionId: schema.studyGroupSessions.id,
        groupId: schema.studyGroups.id,
        groupTitle: schema.studyGroups.title,
      }).from(schema.studyGroupSessions)
        .innerJoin(schema.studyGroups, eq(schema.studyGroups.id, schema.studyGroupSessions.groupId))
        .where(inArray(schema.studyGroupSessions.id, studyGroupSessionIds));
      const bySession = new Map(sessionGroups.map(row =>
        [row.sessionId, { id: row.groupId, title: row.groupTitle }]));
      for (const item of items) {
        if (item.source === "study_group" && item.sourceId)
          item.studyGroup = bySession.get(item.sourceId) ?? null;
      }
    }
    const chapelTimes = await siteChapelTimes(db, schema, sites, actor.scope.programIds ?? [], rangeStart, rangeEnd);
    items.push(...chapelTimes.items);

    // Class context shared by stored section events and derived class times:
    // assigned teacher names, plus the guardian's related children.
    const classSectionIds = [...new Set(items
      .filter(item => item.source === "section" && item.sectionId)
      .map(item => item.sectionId!))];
    if (classSectionIds.length) {
      const teacherRows = await db
        .select({
          sectionId: schema.sectionTeachers.sectionId,
          personId: schema.people.id,
          legalFirstName: schema.people.legalFirstName,
          legalLastName: schema.people.legalLastName,
          preferredName: schema.people.preferredName,
        })
        .from(schema.sectionTeachers)
        .innerJoin(schema.people, eq(schema.people.id, schema.sectionTeachers.personId))
        .where(inArray(schema.sectionTeachers.sectionId, classSectionIds));
      const teachersBySection = new Map<string, { personId: string; name: string }[]>();
      for (const row of teacherRows) {
        const teachers = teachersBySection.get(row.sectionId) ?? [];
        teachers.push({ personId: row.personId, name: personDisplayName(row) });
        teachersBySection.set(row.sectionId, teachers);
      }
      for (const item of items) {
        if (item.source !== "section" || !item.sectionId) continue;
        item.teachers = teachersBySection.get(item.sectionId) ?? [];
        item.teacherNames = item.teachers.map(teacher => teacher.name);
        if (actor.role === "guardian") item.guardianStudents = guardianStudents.get(item.sectionId) ?? [];
      }
    }

    let deadlinesTruncated = false;
    if (sectionIds.length && actor.role !== "room_facilitator") {
      const dueRows = await db
        .select({
          id: schema.assessments.id,
          title: schema.assessments.title,
          dueAt: schema.assessments.dueAt,
          sectionTitle: schema.sections.title,
          sectionId: schema.sections.id,
        })
        .from(schema.assessments)
        .innerJoin(schema.sections, eq(schema.sections.id, schema.assessments.sectionId))
        .where(and(
          inArray(schema.assessments.sectionId, sectionIds),
          inArray(schema.assessments.status, ["published", "closed"]),
          gte(schema.assessments.dueAt, rangeStart),
          lt(schema.assessments.dueAt, rangeEnd),
        ))
        .orderBy(asc(schema.assessments.dueAt))
        .limit(201);
      deadlinesTruncated = dueRows.length > 200;
      for (const row of dueRows.slice(0, 200)) {
        if (!row.dueAt) continue;
        items.push({
          id: `assessment:${row.id}`,
          title: row.title,
          type: "due_date",
          source: "assessment",
          startsAt: row.dueAt.toISOString(),
          endsAt: null,
          timezone: "America/Los_Angeles",
          description: row.sectionTitle,
          cancelled: false,
          manageable: false,
          sectionId: row.sectionId,
          ...(actor.role === "guardian" ? { guardianStudents: guardianStudents.get(row.sectionId) ?? [] } : {}),
        });
      }
    }

    items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return { connected: true, viewerRole, items, truncated:events.length>200 || deadlinesTruncated || classTimes.truncated || chapelTimes.truncated };
  }

export const getCalendarMonth = createServerFn({ method: "GET" })
  .validator((value: unknown) =>
    z.object({
      year: z.number().int().min(2000).max(2100),
      month: z.number().int().min(1).max(12),
    }).parse(value))
  .handler(async ({ data }) => readCalendarWindow(
    await requireActor(calendarReadRoles),
    new Date(Date.UTC(data.year, data.month - 1, 1)),
    new Date(Date.UTC(data.year, data.month, 1)),
  ));

/** Bounded daily windows share the canonical month visibility policy. */
export const getCalendarRange = createServerFn({ method:"GET" })
  .validator((value:unknown)=>z.object({
    startsAt:z.string().datetime({offset:true}),
    endsAt:z.string().datetime({offset:true}),
  }).strict().refine(input=>{
    const duration=Date.parse(input.endsAt)-Date.parse(input.startsAt);
    return duration>0 && duration<=3*24*60*60*1000;
  },{message:"Calendar range must be positive and at most three days"}).parse(value))
  .handler(async({data})=>readCalendarWindow(
    await requireActor(calendarReadRoles),new Date(data.startsAt),new Date(data.endsAt),
  ));

type CalendarInviteGroup = {
  id: string;
  kind: "study_group" | "household" | "section" | "program";
  title: string;
  members: { personId: string; name: string }[];
};
type CalendarTx = Parameters<Parameters<(typeof import("@/db/client").db)["transaction"]>[0]>[0];

async function personalEventInviteGroups(
  tx: CalendarTx,
  schema: Schema,
  actor: Awaited<ReturnType<typeof requireActor>>,
): Promise<CalendarInviteGroup[]> {
  const memberships = await tx.select({
    id: schema.studyGroups.id,
    title: schema.studyGroups.title,
    siteId: schema.studyGroups.siteId,
    programId: schema.studyGroups.programId,
    sectionId: schema.studyGroups.sectionId,
  }).from(schema.studyGroupMemberships)
    .innerJoin(schema.studyGroups, eq(schema.studyGroups.id, schema.studyGroupMemberships.groupId))
    .where(and(
      eq(schema.studyGroupMemberships.personId, actor.actorPersonId),
      eq(schema.studyGroupMemberships.status, "approved"),
      eq(schema.studyGroups.status, "active"),
    ));

  const groups: CalendarInviteGroup[] = [];
  for (const candidate of memberships) {
    let group: Awaited<ReturnType<typeof participatingStudent>>;
    try {
      group = await participatingStudent(tx, actor, candidate.id);
    } catch (error) {
      if (!(error instanceof AuthorizationError)) throw error;
      continue;
    }
    const roster = await tx.select({
      personId: schema.people.id,
      legalFirstName: schema.people.legalFirstName,
      legalLastName: schema.people.legalLastName,
      preferredName: schema.people.preferredName,
    }).from(schema.studyGroupMemberships)
      .innerJoin(schema.people, eq(schema.people.id, schema.studyGroupMemberships.personId))
      .where(and(
        eq(schema.studyGroupMemberships.groupId, group.id),
        eq(schema.studyGroupMemberships.status, "approved"),
      ));
    const members: CalendarInviteGroup["members"] = [];
    for (const member of roster) {
      if (member.personId === actor.actorPersonId) continue;
      try {
        await eligibleStudent(tx, member.personId, group, actor.scope.programIds ?? []);
        members.push({ personId: member.personId, name: personDisplayName(member) });
      } catch (error) {
        if (!(error instanceof AuthorizationError)) throw error;
        // Stale group memberships do not grant current calendar visibility.
      }
    }
    if (members.length) groups.push({ id: group.id, kind: "study_group", title: group.title, members });
  }
  return groups;
}

async function calendarInviteGroups(
  db: typeof import("@/db/client").db,
  schema: Schema,
  actor: Awaited<ReturnType<typeof requireActor>>,
): Promise<CalendarInviteGroup[]> {
  if (actor.role === "student") {
    return db.transaction(tx => personalEventInviteGroups(tx, schema, actor));
  }

  if (actor.role === "guardian") {
    const households = await db.select({ id: schema.households.id, title: schema.households.displayName })
      .from(schema.householdMemberships)
      .innerJoin(schema.households, eq(schema.households.id, schema.householdMemberships.householdId))
      .where(eq(schema.householdMemberships.personId, actor.actorPersonId));
    const groups: CalendarInviteGroup[] = [];
    for (const household of households) {
      const roster = await db.select({
        personId: schema.people.id,
        legalFirstName: schema.people.legalFirstName,
        legalLastName: schema.people.legalLastName,
        preferredName: schema.people.preferredName,
      }).from(schema.householdMemberships)
        .innerJoin(schema.people, and(
          eq(schema.people.id, schema.householdMemberships.personId),
          eq(schema.people.active, true),
        ))
        .where(eq(schema.householdMemberships.householdId, household.id));
      const members = roster.filter(member => member.personId !== actor.actorPersonId)
        .map(member => ({ personId: member.personId, name: personDisplayName(member) }));
      if (members.length) groups.push({ id: household.id, kind: "household", title: household.title, members });
    }
    return groups;
  }

  if (actor.role === "teacher") {
    const { accessibleClasses } = await import("@/modules/learning/class-access.server");
    const authorizedSections = await accessibleClasses(actor);
    const sectionIds = authorizedSections.map(section => section.id);
    if (!sectionIds.length) return [];
    const activeProgram = alias(schema.enrollments, "calendar_invite_active_program");
    const roster = await db.select({
      sectionId: schema.enrollments.sectionId,
      personId: schema.studentProfiles.personId,
      legalFirstName: schema.people.legalFirstName,
      legalLastName: schema.people.legalLastName,
      preferredName: schema.people.preferredName,
      sectionTitle: schema.sections.title,
    }).from(schema.enrollments)
      .innerJoin(schema.sections, eq(schema.sections.id, schema.enrollments.sectionId))
      .innerJoin(schema.terms, eq(schema.terms.id, schema.sections.termId))
      .innerJoin(activeProgram, and(
        eq(activeProgram.studentProfileId, schema.enrollments.studentProfileId),
        eq(activeProgram.programId, schema.sections.programId),
        eq(activeProgram.schoolYearId, schema.terms.schoolYearId),
        eq(activeProgram.kind, "program"), eq(activeProgram.status, "active"),
      ))
      .innerJoin(schema.studentProfiles, eq(schema.studentProfiles.id, schema.enrollments.studentProfileId))
      .innerJoin(schema.people, and(
        eq(schema.people.id, schema.studentProfiles.personId),
        eq(schema.people.active, true),
      ))
      .where(and(
        inArray(schema.enrollments.sectionId, sectionIds),
        eq(schema.enrollments.kind, "section"), eq(schema.enrollments.status, "active"),
        eq(schema.enrollments.programId, schema.sections.programId),
        eq(schema.enrollments.schoolYearId, schema.terms.schoolYearId),
        eq(schema.sections.active, true),
      ));
    const membersBySection = new Map<string, Map<string, { personId: string; name: string }>>();
    for (const student of roster) {
      if (!student.sectionId) continue;
      const members = membersBySection.get(student.sectionId) ?? new Map();
      members.set(student.personId, { personId: student.personId, name: personDisplayName(student) });
      membersBySection.set(student.sectionId, members);
    }
    return authorizedSections.flatMap(section => {
      const members = [...(membersBySection.get(section.id)?.values() ?? [])];
      return members.length
        ? [{ id: section.id, kind: "section" as const, title: section.title, members }]
        : [];
    });
  }

  if (hasRegistrarAuthority(actor.role)) {
    const programs = await db.select({ id: schema.programs.id, title: schema.programs.name, siteId: schema.programs.siteId })
      .from(schema.programs)
      .where(and(
        inArray(schema.programs.id, actor.scope.programIds ?? []),
        inArray(schema.programs.siteId, actorSiteIds(actor)),
        eq(schema.programs.status, "active"),
      ));
    const { listAllowedThreadContacts } = await import("@/modules/communication/messages.functions");
    const groups: CalendarInviteGroup[] = [];
    for (const program of programs) {
      if (!program.siteId) continue;
      const contacts = await listAllowedThreadContacts(db, schema, {
        ...actor,
        scope: { ...actor.scope, siteIds: [program.siteId], programIds: [program.id] },
      });
      if (contacts.length && contacts.length <= 100) {
        groups.push({
          id: program.id, kind: "program", title: program.title,
          members: contacts.map(({ personId, name }) => ({ personId, name })),
        });
      }
    }
    return groups;
  }

  return [];
}

export const listCalendarInviteOptions = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await requireActor(allRoles, "calendar.event.create");
    const [{ db }, schema] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const { listAllowedThreadContacts } = await import("@/modules/communication/messages.functions");
    const [contacts, groups] = await Promise.all([
      listAllowedThreadContacts(db, schema, actor),
      calendarInviteGroups(db, schema, actor),
    ]);
    return { contacts, groups };
  });

export const createPersonalEvent = createServerFn({ method: "POST" })
  .validator((value: unknown) =>
    z.object({
      title: z.string().min(3).max(200),
      description: z.string().max(2000).optional(),
      startsAt: z.string().datetime({ offset: true }),
      endsAt: z.string().datetime({ offset: true }).optional(),
      timezone: z.string().min(1).max(100).refine(isValidTimeZone, "timezone must be a valid IANA timezone").default("America/Los_Angeles"),
      inviteePersonIds: z.array(z.string().uuid()).max(100).default([]),
      groupIds: z.array(z.string().uuid()).max(50).default([]),
    }).refine((input) => !input.endsAt || new Date(input.endsAt) > new Date(input.startsAt), {
      message: "endsAt must be after startsAt",
      path: ["endsAt"],
    }).refine(input => new Set(input.inviteePersonIds).size === input.inviteePersonIds.length &&
      new Set(input.groupIds).size === input.groupIds.length, {
      message: "Choose each invitee and group only once.",
    }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(allRoles, "calendar.event.create");
    const [{ db }, schema] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const allowedContactIds = data.inviteePersonIds.length
      ? new Set((await (await import("@/modules/communication/messages.functions"))
        .listAllowedThreadContacts(db, schema, actor)).map(contact => contact.personId))
      : new Set<string>();
    const inviteGroups = data.inviteePersonIds.length || data.groupIds.length
      ? await calendarInviteGroups(db, schema, actor)
      : [];
    // Personal events must not inherit an arbitrary first school in multi-site accounts.
    // Their owner participant record is the visibility authority.
    const siteId = null;
    return db.transaction(async (tx) => {
      const groupsById = new Map(inviteGroups.map(group => [group.id, group]));
      const invitees = new Set<string>();
      for (const groupId of data.groupIds) {
        const group = groupsById.get(groupId);
        if (!group) throw new AuthorizationError("approved study-group membership");
        for (const member of group.members) invitees.add(member.personId);
      }
      const eligiblePeople = new Set(inviteGroups.flatMap(group => group.members.map(member => member.personId)));
      for (const personId of data.inviteePersonIds) {
        if (!allowedContactIds.has(personId) && !eligiblePeople.has(personId)) {
          throw new AuthorizationError("shared approved study-group membership");
        }
        invitees.add(personId);
      }
      if (invitees.size > 100) throw new Error("Choose no more than 100 people to invite.");

      const [occurrence] = await tx
        .insert(schema.scheduledOccurrences)
        .values({
          startsAt: new Date(data.startsAt),
          endsAt: data.endsAt ? new Date(data.endsAt) : null,
          timezone: data.timezone,
          siteId,
          createdByPersonId: actor.actorPersonId,
        })
        .returning({ id: schema.scheduledOccurrences.id });
      if (!occurrence) throw new Error("Failed to create scheduled occurrence");

      const [event] = await tx
        .insert(schema.calendarEvents)
        .values({
          type: "personal",
          title: data.title,
          description: data.description ?? null,
          startsAt: new Date(data.startsAt),
          endsAt: data.endsAt ? new Date(data.endsAt) : null,
          timezone: data.timezone,
          siteId,
          scheduledOccurrenceId: occurrence.id,
          createdByPersonId: actor.actorPersonId,
        })
        .returning({ id: schema.calendarEvents.id });
      if (!event) throw new Error("Failed to create calendar event");
      await tx.insert(schema.calendarEventParticipants).values([
        {
          calendarEventId: event.id,
          participantType: "person",
          participantId: actor.actorPersonId,
          role: "owner",
          responseStatus: "accepted",
        },
        ...[...invitees].map(participantId => ({
          calendarEventId: event.id,
          participantType: "person",
          participantId,
          role: "attendee",
          responseStatus: "none" as const,
        })),
      ]);
      await notifyMany(tx, [...invitees].map(recipientPersonId => ({
        recipientPersonId,
        type: "calendar_event_invitation",
        title: "Meeting invitation",
        body: `You were invited to ${data.title}.`,
        resourceType: "calendar_event",
        resourceId: event.id,
      })));
      await recordAudit(tx, actor, {
        action: "calendar.personal_event.create",
        resourceType: "calendar_event",
        resourceId: event.id,
        after: {
          title: data.title,
          startsAt: data.startsAt,
          endsAt: data.endsAt ?? null,
          timezone: data.timezone,
          invitedPeopleCount: invitees.size,
        },
        scope: { siteId },
      });
      await emitEvent(tx, {
        eventType: EventTypes.CalendarEventCreated,
        aggregateType: "calendar_event",
        aggregateId: event.id,
        actorPersonId: actor.actorPersonId,
        payload: {
          type: "personal",
          title: data.title,
          startsAt: data.startsAt,
          endsAt: data.endsAt ?? null,
          timezone: data.timezone,
          invitedPeopleCount: invitees.size,
        },
      });
      return { eventId: event.id };
    });
  });

export const moveAssessmentDueDate = createServerFn({ method: "POST" })
  .validator((value: unknown) =>
    z.object({
      assessmentId: z.string().uuid(),
      newDueAt: z.string().datetime({ offset: true }),
    }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["teacher"], "assignments:create");
    const sites = actorSiteIds(actor);
    const [{ db }, schema] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const newDueAt = new Date(data.newDueAt);
    if(newDueAt<=new Date())throw new Error("Choose a future assessment due date");
    return db.transaction(async (tx) => {
      const [assessment] = await tx
        .select({
          id: schema.assessments.id,
          sectionId: schema.assessments.sectionId,
          dueAt: schema.assessments.dueAt,
          status:schema.assessments.status,
          siteId: schema.sections.siteId,
          programId:schema.sections.programId,
        })
        .from(schema.assessments)
        .innerJoin(schema.sections, eq(schema.sections.id, schema.assessments.sectionId))
        .innerJoin(schema.sectionTeachers, and(
          eq(schema.sectionTeachers.sectionId, schema.sections.id),
          eq(schema.sectionTeachers.personId, actor.actorPersonId),
        ))
        .where(and(eq(schema.assessments.id, data.assessmentId), inArray(schema.sections.siteId, sites), inArray(schema.sections.programId,actor.scope.programIds??[])))
        .for("update")
        .limit(1);
      if (!assessment) throw new AuthorizationError("assessment teaching relationship");
      if(!["published","closed"].includes(assessment.status))throw new Error("Only published or closed assessments can be rescheduled");
      const previousDueAt = assessment.dueAt ? assessment.dueAt.toISOString() : null;
      await tx
        .update(schema.assessments)
        .set({ dueAt: newDueAt, updatedAt: new Date() })
        .where(eq(schema.assessments.id, assessment.id));
      await recordAudit(tx, actor, {
        action: "assessment.due_date.move",
        resourceType: "assessment",
        resourceId: assessment.id,
        before: { dueAt: previousDueAt },
        after: { dueAt: newDueAt.toISOString() },
        scope: { siteId: assessment.siteId, programId:assessment.programId, sectionId: assessment.sectionId },
      });
      await emitEvent(tx, {
        eventType: EventTypes.AcademicCalendarChanged,
        aggregateType: "assessment",
        aggregateId: assessment.id,
        actorPersonId: actor.actorPersonId,
        siteId: assessment.siteId,
        programId: assessment.programId,
        sectionId: assessment.sectionId,
        payload: { previousDueAt, newDueAt: newDueAt.toISOString() },
      });
      return { saved: true };
    });
  });

export const reviseCalendarEvent = createServerFn({ method: "POST" })
  .validator((value: unknown) =>
    z.discriminatedUnion("action", [
      z.object({
        action: z.literal("edit"),
        eventId: z.string().uuid(),
        title: z.string().min(3).max(200),
        description: z.string().max(2000).nullish(),
      }),
      z.object({
        action: z.literal("reschedule"),
        eventId: z.string().uuid(),
        startsAt: z.string().datetime({ offset: true }),
        endsAt: z.string().datetime({ offset: true }).nullish(),
      }),
      z.object({ action: z.literal("cancel"), eventId: z.string().uuid() }),
    ]).parse(value))
  .handler(async ({ data }) =>
    reviseCalendarEventForActor(await requireActor(allRoles), data));

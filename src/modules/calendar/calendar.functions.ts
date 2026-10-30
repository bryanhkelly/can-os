import { AuthorizationError } from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { EventTypes } from "@/domain/event-types";
import { actorSiteIds,recordAudit,requireActor,type ActorRole } from "@/modules/identity/actors.server";
import { emitEvent } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and,asc,eq,gt,gte,inArray,isNull,lt,ne,notExists,or } from "drizzle-orm";
import { z } from "zod";
import { reviseCalendarEventForActor } from "./calendar-events.server";
import { visibleStudyGroupCalendarEventIds } from "./group-calendar-visibility.server";
import { isValidTimeZone } from "./timezone";

const allRoles: readonly ActorRole[] = ["student", "teacher", "guardian", "registrar", "specialist", "counselor"];

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
};

type Schema = typeof import("@/db/schema");

/** Section ids the actor may read: enrolled (student), taught (teacher), related students (guardian). */
async function visibleSectionIds(db: typeof import("@/db/client").db, schema: Schema, actor: Awaited<ReturnType<typeof requireActor>>, sites: string[]): Promise<string[]> {
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
      .select({ sectionId: schema.enrollments.sectionId })
      .from(schema.guardianRelationships)
      .innerJoin(schema.studentProfiles, eq(schema.studentProfiles.personId, schema.guardianRelationships.studentPersonId))
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
    return rows.map((row) => row.sectionId).filter((id): id is string => Boolean(id));
  }
  return [];
}

async function readCalendarWindow(actor: Awaited<ReturnType<typeof requireActor>>, rangeStart: Date, rangeEnd: Date) {
    setResponseHeader("Cache-Control", "private, no-store");
    const viewerRole = actor.role as ActorRole;
    if (!process.env.DATABASE_URL) return { connected: false, viewerRole, items: [] as CalendarFeedItem[], truncated:false };
    const sites = actorSiteIds(actor);
    const [{ db }, schema] = await Promise.all([import("@/db/client"), import("@/db/schema")]);

    const sectionIds = await visibleSectionIds(db, schema, actor, sites);
    const visibleStudyGroupEventIds = await visibleStudyGroupCalendarEventIds(
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
          and(
            ne(schema.calendarEvents.type, "study_group"),
            inArray(schema.calendarEvents.id, participantEventIds),
          ),
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
              actor.role === "registrar"
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
      };
    });

    let deadlinesTruncated = false;
    if (sectionIds.length) {
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
        });
      }
    }

    items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return { connected: true, viewerRole, items, truncated:events.length>200 || deadlinesTruncated };
  }

export const getCalendarMonth = createServerFn({ method: "GET" })
  .validator((value: unknown) =>
    z.object({
      year: z.number().int().min(2000).max(2100),
      month: z.number().int().min(1).max(12),
    }).parse(value))
  .handler(async ({ data }) => readCalendarWindow(
    await requireActor(allRoles),
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
    await requireActor(allRoles),new Date(data.startsAt),new Date(data.endsAt),
  ));

export const createPersonalEvent = createServerFn({ method: "POST" })
  .validator((value: unknown) =>
    z.object({
      title: z.string().min(3).max(200),
      description: z.string().max(2000).optional(),
      startsAt: z.string().datetime({ offset: true }),
      endsAt: z.string().datetime({ offset: true }).optional(),
      timezone: z.string().min(1).max(100).refine(isValidTimeZone, "timezone must be a valid IANA timezone").default("America/Los_Angeles"),
    }).refine((input) => !input.endsAt || new Date(input.endsAt) > new Date(input.startsAt), {
      message: "endsAt must be after startsAt",
      path: ["endsAt"],
    }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(allRoles, "calendar.event.create");
    const [{ db }, schema] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    // Personal events must not inherit an arbitrary first school in multi-site accounts.
    // Their owner participant record is the visibility authority.
    const siteId = null;
    return db.transaction(async (tx) => {
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
      await tx.insert(schema.calendarEventParticipants).values({
        calendarEventId: event.id,
        participantType: "person",
        participantId: actor.actorPersonId,
        role: "owner",
        responseStatus: "accepted",
      });
      await recordAudit(tx, actor, {
        action: "calendar.personal_event.create",
        resourceType: "calendar_event",
        resourceId: event.id,
        after: {
          title: data.title,
          startsAt: data.startsAt,
          endsAt: data.endsAt ?? null,
          timezone: data.timezone,
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

import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, gte, inArray, lt, or, isNull, ne, notExists } from "drizzle-orm";
import { z } from "zod";
import { actorSiteIds, recordAudit, requireActor, type ActorRole } from "@/modules/identity/actors.server";
import { EventTypes } from "@/domain/event-types";
import { AuthorizationError } from "@/domain/command-context";

const allRoles: readonly ActorRole[] = ["student", "teacher", "guardian", "registrar", "specialist"];

export type CalendarFeedItem = {
  id: string;
  title: string;
  type: string;
  source: "site" | "section" | "personal" | "assessment";
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  description: string | null;
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
    const rows = await db
      .select({ sectionId: schema.sectionTeachers.sectionId })
      .from(schema.sectionTeachers)
      .innerJoin(schema.sections, eq(schema.sections.id, schema.sectionTeachers.sectionId))
      .where(and(eq(schema.sectionTeachers.personId, actor.actorPersonId), inArray(schema.sections.siteId, sites), inArray(schema.sections.programId, actor.scope.programIds ?? [])));
    return rows.map((row) => row.sectionId);
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
        eq(schema.guardianRelationships.guardianPersonId, actor.actorPersonId),
        eq(schema.guardianRelationships.canViewAcademics, true),
        inArray(schema.enrollments.programId, actor.scope.programIds ?? []),
        inArray(schema.sections.siteId, sites),
        inArray(schema.sections.programId, actor.scope.programIds ?? []),
      ));
    return rows.map((row) => row.sectionId).filter((id): id is string => Boolean(id));
  }
  return [];
}

export const getCalendarMonth = createServerFn({ method: "GET" })
  .validator((value: unknown) =>
    z.object({
      year: z.number().int().min(2000).max(2100),
      month: z.number().int().min(1).max(12),
    }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(allRoles);
    setResponseHeader("Cache-Control", "private, no-store");
    const viewerRole = actor.role as ActorRole;
    if (!process.env.DATABASE_URL) return { connected: false, viewerRole, items: [] as CalendarFeedItem[] };
    const sites = actorSiteIds(actor);
    const [{ db }, schema] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const rangeStart = new Date(Date.UTC(data.year, data.month - 1, 1));
    const rangeEnd = new Date(Date.UTC(data.year, data.month, 1));

    const sectionIds = await visibleSectionIds(db, schema, actor, sites);

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
      .where(and(
        gte(schema.calendarEvents.startsAt, rangeStart),
        lt(schema.calendarEvents.startsAt, rangeEnd),
        ne(schema.calendarEvents.type, "study_group"),
        or(
          and(inArray(schema.calendarEvents.siteId, sites),
            isNull(schema.calendarEvents.sectionId),
            or(isNull(schema.calendarEvents.programId),inArray(schema.calendarEvents.programId,actor.scope.programIds??[])),
            ne(schema.calendarEvents.type, "personal"),
            notExists(hasExplicitParticipants)),
          sectionIds.length ? and(inArray(schema.calendarEvents.sectionId, sectionIds),
            notExists(hasExplicitParticipants)) : undefined,
          inArray(schema.calendarEvents.id, participantEventIds),
        ),
      ))
      .orderBy(asc(schema.calendarEvents.startsAt))
      .limit(200);

    const items: CalendarFeedItem[] = events.map((event) => ({
      id: event.id,
      title: event.title,
      type: event.type,
      source: event.type === "personal" ? "personal" : event.sectionId ? "section" : "site",
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt ? event.endsAt.toISOString() : null,
      timezone: event.timezone,
      description: event.description,
    }));

    if (sectionIds.length) {
      const dueRows = await db
        .select({
          id: schema.assessments.id,
          title: schema.assessments.title,
          dueAt: schema.assessments.dueAt,
          sectionTitle: schema.sections.title,
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
        .limit(200);
      for (const row of dueRows) {
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
        });
      }
    }

    items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return { connected: true, viewerRole, items };
  });

export const createPersonalEvent = createServerFn({ method: "POST" })
  .validator((value: unknown) =>
    z.object({
      title: z.string().min(3).max(200),
      description: z.string().max(2000).optional(),
      startsAt: z.string().datetime({ offset: true }),
      endsAt: z.string().datetime({ offset: true }).optional(),
      timezone: z.string().min(1).max(100).default("America/Los_Angeles"),
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
        after: { title: data.title, startsAt: data.startsAt, endsAt: data.endsAt ?? null },
        scope: { siteId },
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
    return db.transaction(async (tx) => {
      const [assessment] = await tx
        .select({
          id: schema.assessments.id,
          sectionId: schema.assessments.sectionId,
          dueAt: schema.assessments.dueAt,
          siteId: schema.sections.siteId,
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
        scope: { siteId: assessment.siteId, sectionId: assessment.sectionId },
      });
      await tx.insert(schema.domainEvents).values({
        eventType: EventTypes.AcademicCalendarChanged,
        aggregateType: "assessment",
        aggregateId: assessment.id,
        actorPersonId: actor.actorPersonId,
        payload: { previousDueAt, newDueAt: newDueAt.toISOString() },
      });
      return { saved: true };
    });
  });

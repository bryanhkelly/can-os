import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, gte, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { EventTypes } from "@/domain/event-types";
import { classroomMeetingUrl, readClassroomMeetingUrl } from "@/domain/classroom-meeting";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { authorizeClass, classActor } from "./class-access.server";
import { classSelection } from "./class-workspace.functions";
import { dateTimeInputInTimezone } from "@/modules/calendar/timezone";

export const scheduleClassroomMeeting = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    id: z.string().uuid(), sectionId: z.string().uuid(), title: z.string().trim().min(3).max(200),
    startsLocal: z.string().max(16), endsLocal: z.string().max(16), meetingUrl: classroomMeetingUrl,
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await classActor();
    if (actor.role !== "teacher") throw new AuthorizationError("assigned teacher scheduling");
    assertCapability(actor, "calendar.event.create");
    assertCapability(actor, "calendar.event.manage");
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async tx => {
      const { section } = await authorizeClass(actor, data.sectionId, undefined, tx);
      if (!section.siteId) throw new AuthorizationError("class site");
      const startsAt = new Date(dateTimeInputInTimezone(data.startsLocal, section.timezone, "reject"));
      const endsAt = new Date(dateTimeInputInTimezone(data.endsLocal, section.timezone, "reject"));
      if (endsAt <= startsAt) throw new DomainError("VALIDATION_FAILED", "Class meeting end must follow its start.");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`classroom-event:${data.id}`}, 0))`);
      const [existing] = await tx.select({ event: s.calendarEvents, occurrence: s.scheduledOccurrences })
        .from(s.calendarEvents).innerJoin(s.scheduledOccurrences, eq(s.calendarEvents.scheduledOccurrenceId, s.scheduledOccurrences.id))
        .where(eq(s.calendarEvents.id, data.id)).limit(1);
      if (existing) {
        if (existing.event.createdByPersonId !== actor.actorPersonId || existing.event.type !== "class_session" || existing.event.sourceType ||
          existing.event.sectionId !== section.id || existing.event.siteId !== section.siteId ||
          existing.event.programId !== section.programId || existing.occurrence.sectionId !== section.id ||
          existing.occurrence.siteId !== section.siteId || existing.occurrence.programId !== section.programId ||
          existing.event.title !== data.title || existing.occurrence.startsAt.getTime() !== startsAt.getTime() ||
          existing.occurrence.endsAt?.getTime() !== endsAt.getTime() ||
          readClassroomMeetingUrl(existing.event.metadata) !== data.meetingUrl || existing.event.metadata.cancelled === true)
          throw new DomainError("CONFLICT", "This scheduling request was already used for different details.");
        return { id: existing.event.id };
      }
      const [program] = await tx.select({ organizationId: s.programs.organizationId }).from(s.programs)
        .where(eq(s.programs.id, section.programId)).limit(1);
      if (!program) throw new AuthorizationError("class program owner");
      const scope = { organizationId: program.organizationId, siteId: section.siteId, programId: section.programId, sectionId: section.id };
      const [occurrence] = await tx.insert(s.scheduledOccurrences).values({
        ...scope, startsAt, endsAt, timezone: section.timezone, createdByPersonId: actor.actorPersonId,
      }).returning({ id: s.scheduledOccurrences.id });
      if (!occurrence) throw new Error("Class meeting occurrence did not persist.");
      await tx.insert(s.calendarEvents).values({
        id: data.id, ...scope, type: "class_session", title: data.title, startsAt, endsAt, timezone: section.timezone,
        scheduledOccurrenceId: occurrence.id, createdByPersonId: actor.actorPersonId,
        metadata: { classroomMeetingUrl: data.meetingUrl },
      });
      await tx.insert(s.calendarEventParticipants).values({
        calendarEventId: data.id, participantType: "person", participantId: actor.actorPersonId, role: "owner", responseStatus: "accepted",
      });
      await writeAudit(tx, actor, { action: "calendar.classroom_meeting.schedule", entityType: "calendar_event", entityId: data.id,
        scope, after: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), hasMeetingLink: true } });
      await emitEvent(tx, { eventType: EventTypes.CalendarEventCreated, aggregateType: "calendar_event", aggregateId: data.id,
        actorPersonId: actor.actorPersonId, ...scope, payload: { type: "class_session", scheduledOccurrenceId: occurrence.id } });
      return { id: data.id };
    });
  });

export const getClassroomMeetings = createServerFn({ method: "GET" })
  .validator((value: unknown) => classSelection.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await classActor();
    const { section } = await authorizeClass(actor, data.sectionId, data.studentPersonId);
    if (!section.siteId) throw new AuthorizationError("class site");
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const now = new Date();
    const horizon = new Date(now.getTime() + 30 * 86_400_000);
    const events = await db.select({ id: s.calendarEvents.id, title: s.calendarEvents.title,
      startsAt: s.scheduledOccurrences.startsAt, endsAt: s.scheduledOccurrences.endsAt,
      timezone: s.scheduledOccurrences.timezone, metadata: s.calendarEvents.metadata, sourceType: s.calendarEvents.sourceType })
      .from(s.calendarEvents).innerJoin(s.scheduledOccurrences, eq(s.calendarEvents.scheduledOccurrenceId, s.scheduledOccurrences.id))
      .where(and(eq(s.calendarEvents.sectionId, section.id), eq(s.scheduledOccurrences.sectionId, section.id),
        eq(s.scheduledOccurrences.siteId, section.siteId), eq(s.scheduledOccurrences.programId, section.programId),
        eq(s.calendarEvents.siteId, section.siteId), eq(s.calendarEvents.programId, section.programId),
        or(gte(s.scheduledOccurrences.startsAt, now), gte(s.scheduledOccurrences.endsAt, now)),
        lte(s.scheduledOccurrences.startsAt, horizon))).orderBy(asc(s.scheduledOccurrences.startsAt)).limit(30);
    return events.map(event => ({ id: event.id, title: event.title, startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt?.toISOString() ?? null, timezone: event.timezone, cancelled: event.metadata.cancelled === true,
      meetingUrl: actor.role === "guardian" || event.metadata.cancelled === true ? null : readClassroomMeetingUrl(event.metadata),
      canManage: actor.role === "teacher" && !event.sourceType && event.metadata.cancelled !== true }));
  });

export const setClassroomMeetingLink = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ sectionId: z.string().uuid(), eventId: z.string().uuid(),
    meetingUrl: classroomMeetingUrl.nullable(), expectedMeetingUrl: classroomMeetingUrl.nullable() }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await classActor();
    if (actor.role !== "teacher") throw new AuthorizationError("assigned teacher calendar management");
    assertCapability(actor, "calendar.event.manage");
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async tx => {
      const { section } = await authorizeClass(actor, data.sectionId, undefined, tx);
      if (!section.siteId) throw new AuthorizationError("class site");
      const [row] = await tx.select({ event: s.calendarEvents, occurrence: s.scheduledOccurrences })
        .from(s.calendarEvents).innerJoin(s.scheduledOccurrences, eq(s.calendarEvents.scheduledOccurrenceId, s.scheduledOccurrences.id))
        .where(eq(s.calendarEvents.id, data.eventId)).for("update").limit(1);
      if (!row || row.event.sectionId !== section.id || row.occurrence.sectionId !== section.id ||
        row.event.programId !== section.programId || row.occurrence.programId !== section.programId ||
        row.event.siteId !== section.siteId || row.occurrence.siteId !== section.siteId)
        throw new AuthorizationError("same section calendar occurrence");
      if (row.event.sourceType) throw new AuthorizationError("directly managed calendar event");
      if (row.event.metadata.cancelled === true) throw new DomainError("CONFLICT", "This class event was cancelled.");
      const previous = readClassroomMeetingUrl(row.event.metadata);
      if (previous === data.meetingUrl) return { saved: true };
      if (previous !== data.expectedMeetingUrl) throw new DomainError("CONFLICT", "The class meeting link changed.");
      await tx.update(s.calendarEvents).set({ metadata: { ...row.event.metadata, classroomMeetingUrl: data.meetingUrl },
        updatedAt: new Date() }).where(eq(s.calendarEvents.id, row.event.id));
      await writeAudit(tx, actor, { action: "calendar.classroom_meeting_link.save", entityType: "calendar_event", entityId: row.event.id,
        scope: { sectionId: section.id, siteId: section.siteId, programId: section.programId },
        before: { hasMeetingLink: previous !== null }, after: { hasMeetingLink: data.meetingUrl !== null } });
      await emitEvent(tx, { eventType: EventTypes.CalendarEventUpdated, aggregateType: "calendar_event", aggregateId: row.event.id,
        actorPersonId: actor.actorPersonId, programId: section.programId, siteId: section.siteId,
        payload: { sectionId: section.id, change: "classroom_meeting_link", hasMeetingLink: data.meetingUrl !== null } });
      return { saved: true };
    });
  });

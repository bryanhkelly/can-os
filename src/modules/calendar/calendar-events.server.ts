import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  calendarEventParticipants,
  calendarEvents,
  scheduledOccurrences,
} from "@/db/schema";
import { emitEvent, notifyMany } from "@/platform/mutation";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { recordAudit, type Actor } from "@/modules/identity/actors.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CalendarEventRevision =
  | { action: "edit"; eventId: string; title: string; description?: string | null }
  | { action: "reschedule"; eventId: string; startsAt: string; endsAt?: string | null }
  | { action: "cancel"; eventId: string };

const STAFF_MANAGE_ROLES = ["registrar", "teacher"] as const;

function validateTimes(startsAt: string, endsAt: string | null | undefined) {
  const start = new Date(startsAt);
  if (!Number.isFinite(start.getTime())) throw new Error("A valid start time is required");
  const end = endsAt ? new Date(endsAt) : null;
  if (end && (!Number.isFinite(end.getTime()) || end <= start)) {
    throw new Error("End time must be after the start time");
  }
  return { start, end };
}

/** One writer per event: source-owned events change only through their owning workflow. */
function assertDirectlyManaged(event: { sourceType: string | null }) {
  if (event.sourceType) {
    throw new Error(
      `This event is created by ${event.sourceType} and can only change through that workflow.`,
    );
  }
}

async function authorizeRevision(
  tx: Tx,
  actor: Actor,
  event: {
    id: string;
    type: string;
    siteId: string | null;
    programId: string | null;
    sectionId: string | null;
    createdByPersonId: string | null;
  },
): Promise<void> {
  if (event.type === "personal") {
    const [ownership] = await tx
      .select({ id: calendarEventParticipants.id })
      .from(calendarEventParticipants)
      .where(and(
        eq(calendarEventParticipants.calendarEventId, event.id),
        eq(calendarEventParticipants.participantType, "person"),
        eq(calendarEventParticipants.participantId, actor.actorPersonId),
        eq(calendarEventParticipants.role, "owner"),
      ))
      .limit(1);
    if (!ownership && event.createdByPersonId !== actor.actorPersonId) {
      throw new AuthorizationError("personal event owner");
    }
    return;
  }

  if (!(STAFF_MANAGE_ROLES as readonly string[]).includes(actor.role)) {
    throw new AuthorizationError("calendar event management");
  }
  assertCapability(actor, "calendar.event.manage");

  if (actor.role === "registrar") {
    if (!event.siteId || !(actor.scope.siteIds ?? []).includes(event.siteId)) {
      throw new AuthorizationError("calendar site scope");
    }
    if (event.programId && !(actor.scope.programIds ?? []).includes(event.programId)) {
      throw new AuthorizationError("calendar program scope");
    }
    return;
  }

  // Teachers manage only events of sections they currently teach.
  if (!event.sectionId) throw new AuthorizationError("section event teaching assignment");
  const { authorizeClass } = await import("@/modules/learning/class-access.server");
  await authorizeClass(actor,event.sectionId,undefined,tx);
}

async function notifyPersonParticipants(
  tx: Tx,
  actor: Actor,
  eventId: string,
  title: string,
  body: string,
) {
  const participants = await tx
    .select({ participantId: calendarEventParticipants.participantId })
    .from(calendarEventParticipants)
    .where(and(
      eq(calendarEventParticipants.calendarEventId, eventId),
      eq(calendarEventParticipants.participantType, "person"),
    ));
  const recipients = participants
    .map((row) => row.participantId)
    .filter((personId) => personId !== actor.actorPersonId);
  if (!recipients.length) return;
  // status relies on the column default ("unread"), matching the prior inline insert.
  await notifyMany(
    tx,
    recipients.map((personId) => ({
      recipientPersonId: personId,
      type: "calendar_event_update",
      title,
      body,
      resourceType: "calendar_event",
      resourceId: eventId,
    })),
  );
}

/**
 * Canonical calendar event lifecycle: edit details, reschedule, cancel.
 * Authorized by verified role + scope + relationship; every change is audited,
 * emits a domain event, and notifies person participants. Source-owned events
 * (study-group sessions, orientations, conferences, …) refuse changes here and
 * remain with their owning workflow, so no shadow calendar can diverge.
 */
export async function reviseCalendarEventForActor(actor: Actor, input: CalendarEventRevision) {
  if (input.action === "edit") {
    const title = input.title.trim();
    if (title.length < 3 || title.length > 200) throw new Error("Title must be 3–200 characters");
    if (input.description && input.description.length > 2000) {
      throw new Error("Description must be 2000 characters or fewer");
    }
  }
  const times = input.action === "reschedule"
    ? validateTimes(input.startsAt, input.endsAt)
    : null;

  return db.transaction(async (tx) => {
    const [rows] = await tx
      .select({
        event: calendarEvents,
        occurrence: scheduledOccurrences,
      })
      .from(calendarEvents)
      .innerJoin(
        scheduledOccurrences,
        eq(calendarEvents.scheduledOccurrenceId, scheduledOccurrences.id),
      )
      .where(eq(calendarEvents.id, input.eventId))
      .for("update")
      .limit(1);
    if (!rows) throw new Error("Calendar event not found");
    const event = {
      ...rows.event,
      startsAt: rows.occurrence.startsAt,
      endsAt: rows.occurrence.endsAt,
      timezone: rows.occurrence.timezone,
      organizationId: rows.occurrence.organizationId,
      siteId: rows.occurrence.siteId,
      programId: rows.occurrence.programId,
      sectionId: rows.occurrence.sectionId,
    };
    await authorizeRevision(tx, actor, event);
    assertDirectlyManaged(event);
    if (event.metadata.cancelled === true) throw new Error("Cancelled event cannot be changed");

    const now = new Date();
    const before = {
      title: event.title,
      description: event.description,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt?.toISOString() ?? null,
    };

    if (input.action === "reschedule" && times) {
      const sameStart = times.start.getTime() === event.startsAt.getTime();
      const sameEnd = (times.end?.getTime() ?? null) === (event.endsAt?.getTime() ?? null);
      if (sameStart && sameEnd) return { saved: true };
      await tx.update(scheduledOccurrences)
        .set({ startsAt: times.start, endsAt: times.end, updatedAt: now })
        .where(eq(scheduledOccurrences.id, event.scheduledOccurrenceId));
      await tx.update(calendarEvents)
        .set({ startsAt: times.start, endsAt: times.end, updatedAt: now })
        .where(eq(calendarEvents.id, event.id));
    } else if (input.action === "edit") {
      await tx.update(calendarEvents)
        .set({ title: input.title.trim(), description: input.description ?? null, updatedAt: now })
        .where(eq(calendarEvents.id, event.id));
    } else {
      await tx.update(calendarEvents)
        .set({
          metadata: { ...event.metadata, cancelled: true, cancelledAt: now.toISOString() },
          updatedAt: now,
        })
        .where(eq(calendarEvents.id, event.id));
    }

    const noticeTitle =
      input.action === "cancel" ? `Event cancelled: ${before.title}`
      : input.action === "reschedule" ? `Event rescheduled: ${before.title}`
      : `Event updated: ${before.title}`;
    const noticeBody =
      input.action === "cancel" ? `"${before.title}" will no longer take place.`
      : input.action === "reschedule" ? `New start time: ${times!.start.toISOString()}`
      : `"${before.title}" was updated.`;
    await notifyPersonParticipants(tx, actor, event.id, noticeTitle, noticeBody);

    const eventType =
      input.action === "cancel" ? EventTypes.CalendarEventCancelled
      : input.action === "reschedule" ? EventTypes.CalendarEventRescheduled
      : EventTypes.CalendarEventUpdated;
    await emitEvent(tx, {
      eventType,
      aggregateType: "calendar_event",
      aggregateId: event.id,
      actorPersonId: actor.actorPersonId,
      payload: {
        action: input.action,
        siteId: event.siteId,
        programId: event.programId,
        sectionId: event.sectionId,
        before,
        after:
          input.action === "cancel"
            ? { cancelled: true, cancelledAt: now.toISOString() }
            : input.action === "reschedule" && times
              ? { startsAt: times.start.toISOString(), endsAt: times.end?.toISOString() ?? null }
              : input.action === "edit"
                ? { title: input.title.trim(), description: input.description ?? null }
                : {},
      },
    });
    await recordAudit(tx, actor, {
      action: `calendar.event.${input.action}`,
      resourceType: "calendar_event",
      resourceId: event.id,
      scope: { siteId: event.siteId, programId: event.programId, sectionId: event.sectionId },
      before,
      after:
        input.action === "cancel" ? { cancelled: true, cancelledAt: now.toISOString() }
        : input.action === "reschedule" && times
          ? { startsAt: times.start.toISOString(), endsAt: times.end?.toISOString() ?? null }
          : input.action === "edit"
            ? { title: input.title.trim(), description: input.description ?? null }
            : {},
    });

    return { saved: true };
  });
}

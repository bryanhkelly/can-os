import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  calendarEventParticipants,
  calendarEvents,
  people,
  scheduledOccurrences,
} from "@/db/schema";
import { cancelProjection, createProjectionIfAbsent, publishProjection, rescheduleProjection, syncParticipants } from "@/platform/calendar/projection";

describe("source-aware calendar projections", () => {
  it("creates source events once without replacing the original schedule on retries", async () => {
    const source = { sourceType: "orientation_test", sourceId: crypto.randomUUID() };
    const startsAt = new Date(Date.now() + 86400000);
    const original = {
      ...source,
      type: "orientation",
      title: "Original orientation",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3600000),
      timezone: "UTC",
    };

    const created = await db.transaction(tx => createProjectionIfAbsent(tx, original));
    const retried = await db.transaction(tx => createProjectionIfAbsent(tx, {
      ...original,
      title: "Retry must not replace the title",
      startsAt: new Date(startsAt.getTime() + 86400000),
      endsAt: new Date(startsAt.getTime() + 90000000),
    }));

    expect(created).toEqual({ id: created.id, created: true });
    expect(retried).toEqual({ id: created.id, created: false });
    const [event] = await db.select().from(calendarEvents)
      .where(eq(calendarEvents.id, created.id));
    expect(event?.title).toBe("Original orientation");
    expect(event?.startsAt).toEqual(startsAt);
    const [occurrence] = await db.select().from(scheduledOccurrences)
      .where(eq(scheduledOccurrences.id, event!.scheduledOccurrenceId));
    expect(occurrence?.startsAt).toEqual(startsAt);
    expect(occurrence?.endsAt).toEqual(original.endsAt);
  });

  it("keeps older calendar writers synchronized through the database bridge", async () => {
    const eventId = crypto.randomUUID();
    const startsAt = new Date(Date.now() + 86400000);
    const endsAt = new Date(startsAt.getTime() + 3600000);

    await db.execute(sql`
      INSERT INTO calendar_events (id, type, title, starts_at, ends_at, timezone)
      VALUES (${eventId}::uuid, 'site_event', 'Legacy writer event', ${startsAt}, ${endsAt}, 'UTC')
    `);

    const [insertedEvent] = await db.select().from(calendarEvents)
      .where(eq(calendarEvents.id, eventId));
    expect(insertedEvent?.scheduledOccurrenceId).toBeTruthy();
    const [insertedOccurrence] = await db.select().from(scheduledOccurrences)
      .where(eq(scheduledOccurrences.id, insertedEvent!.scheduledOccurrenceId));
    expect(insertedOccurrence?.startsAt).toEqual(startsAt);
    expect(insertedOccurrence?.endsAt).toEqual(endsAt);

    const movedStart = new Date(startsAt.getTime() + 86400000);
    const movedEnd = new Date(endsAt.getTime() + 86400000);
    await db.execute(sql`
      UPDATE calendar_events
      SET starts_at = ${movedStart}, ends_at = ${movedEnd}, timezone = 'America/Los_Angeles'
      WHERE id = ${eventId}::uuid
    `);

    const [movedEvent] = await db.select().from(calendarEvents)
      .where(eq(calendarEvents.id, eventId));
    const [movedOccurrence] = await db.select().from(scheduledOccurrences)
      .where(eq(scheduledOccurrences.id, movedEvent!.scheduledOccurrenceId));
    expect(movedOccurrence?.startsAt).toEqual(movedStart);
    expect(movedOccurrence?.endsAt).toEqual(movedEnd);
    expect(movedOccurrence?.timezone).toBe("America/Los_Angeles");
  });

  it("serializes repeated publication, preserves responses, and distinguishes source instances", async () => {
    const sourceId = crypto.randomUUID();
    const [person] = await db.insert(people).values({
      legalFirstName: "Calendar", legalLastName: sourceId,
    }).returning();
    if (!person) throw new Error("Fixture person missing");
    const source = { sourceType: "projection_test", sourceId };
    const startsAt = new Date(Date.now() + 86400000);
    const endsAt = new Date(startsAt.getTime() + 3600000);
    const input = {
      ...source, type: "meeting", title: "Projected meeting", startsAt, endsAt, timezone: "UTC",
      participants: [{ personId: person.id, role: "attendee" }],
    };
    const ids = await Promise.all([
      db.transaction(tx => publishProjection(tx, input)),
      db.transaction(tx => publishProjection(tx, input)),
    ]);
    expect(ids[0]).toBe(ids[1]);
    const eventId = ids[0]!;
    expect(await db.select().from(calendarEvents).where(and(
      eq(calendarEvents.sourceType, source.sourceType), eq(calendarEvents.sourceId, sourceId),
    ))).toHaveLength(1);

    await db.update(calendarEventParticipants).set({ responseStatus: "accepted" })
      .where(eq(calendarEventParticipants.calendarEventId, eventId));
    await db.transaction(tx => syncParticipants(tx, {
      ...source, participants: [{ personId: person.id, role: "speaker" }],
    }));
    const [participant] = await db.select().from(calendarEventParticipants)
      .where(eq(calendarEventParticipants.calendarEventId, eventId));
    expect(participant?.role).toBe("speaker");
    expect(participant?.responseStatus).toBe("accepted");
    await db.transaction(tx => publishProjection(tx, { ...input, participants: undefined }));
    expect(await db.select().from(calendarEventParticipants)
      .where(eq(calendarEventParticipants.calendarEventId, eventId))).toHaveLength(1);
    await db.transaction(tx => syncParticipants(tx, { ...source, participants: [] }));
    expect(await db.select().from(calendarEventParticipants)
      .where(eq(calendarEventParticipants.calendarEventId, eventId))).toHaveLength(0);

    const newStart = new Date(startsAt.getTime() + 86400000);
    await db.transaction(tx => rescheduleProjection(tx, {
      ...source, startsAt: newStart, endsAt: new Date(newStart.getTime() + 3600000),
    }));
    const [rescheduledEvent] = await db.select().from(calendarEvents)
      .where(eq(calendarEvents.id, eventId));
    const [rescheduledOccurrence] = await db.select().from(scheduledOccurrences)
      .where(eq(scheduledOccurrences.id, rescheduledEvent!.scheduledOccurrenceId));
    expect(rescheduledOccurrence?.startsAt).toEqual(newStart);
    expect(rescheduledOccurrence?.endsAt).toEqual(new Date(newStart.getTime() + 3600000));
    await db.transaction(tx => cancelProjection(tx, { ...source, reason: "Weather" }));
    await db.transaction(tx => publishProjection(tx, input));
    const [cancelled] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, eventId));
    expect(cancelled?.metadata.cancelled).toBe(true);
    expect(cancelled?.metadata.cancelReason).toBe("Weather");

    const season = { ...input, sourceType: "activity_season", sourceId: crypto.randomUUID() };
    const first = await db.transaction(tx => publishProjection(tx, { ...season, instanceKey: "practice-1" }));
    const second = await db.transaction(tx => publishProjection(tx, { ...season, instanceKey: "practice-2" }));
    expect(first).not.toBe(second);
    expect(await db.transaction(tx => publishProjection(tx, { ...season, instanceKey: "practice-1" }))).toBe(first);
    await expect(db.transaction(tx => rescheduleProjection(tx, {
      sourceType: season.sourceType, sourceId: season.sourceId, startsAt, endsAt,
    }))).rejects.toThrow("ambiguous");
  });
});

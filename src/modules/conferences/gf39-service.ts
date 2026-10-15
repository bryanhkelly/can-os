import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  actions,
  auditEvents,
  calendarEventParticipants,
  calendarEvents,
  conferenceActions,
  conferenceBookings,
  conferenceNotes,
  conferenceSeries,
  conferenceSlots,
  domainEvents,
  guardianRelationships,
  notifications,
  people,
  sites,
  studentProfiles,
} from "@/db/schema";
import {
  assertCapability,
  assertSiteScope,
  type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";

export async function createConferenceSeries(
  context: CommandContext,
  input: {
    siteId: string;
    teacherPersonId: string;
    sectionId?: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    slotMinutes?: number;
  },
): Promise<string> {
  assertCapability(context, "conference.manage");
  assertSiteScope(context, input.siteId);
  if (input.endsAt <= input.startsAt) {
    throw new Error("Conference series end must be after start");
  }

  const slotMinutes = input.slotMinutes ?? 20;
  if (slotMinutes < 5) throw new Error("Conference slots are too short");

  return db.transaction(async (tx) => {
    const [series] = await tx
      .insert(conferenceSeries)
      .values({
        siteId: input.siteId,
        sectionId: input.sectionId,
        teacherPersonId: input.teacherPersonId,
        title: input.title,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        slotMinutes,
        status: "published",
      })
      .returning({ id: conferenceSeries.id });

    if (!series) throw new Error("Failed to create Conference series");

    const slots: Array<{
      conferenceSeriesId: string;
      startsAt: Date;
      endsAt: Date;
      status: "available";
    }> = [];

    for (
      let cursor = input.startsAt.getTime();
      cursor + slotMinutes * 60_000 <= input.endsAt.getTime();
      cursor += slotMinutes * 60_000
    ) {
      slots.push({
        conferenceSeriesId: series.id,
        startsAt: new Date(cursor),
        endsAt: new Date(cursor + slotMinutes * 60_000),
        status: "available",
      });
    }

    if (slots.length === 0) throw new Error("Conference series has no valid slots");
    await tx.insert(conferenceSlots).values(slots);

    return series.id;
  });
}

export async function bookConference(
  context: CommandContext,
  input: {
    conferenceSlotId: string;
    studentProfileId: string;
  },
): Promise<string> {
  assertCapability(context, "conference.book");
  if (!context.actorPersonId) throw new Error("Guardian identity is required");

  return db.transaction(async (tx) => {
    const [slot] = await tx
      .select({
        slotId: conferenceSlots.id,
        status: conferenceSlots.status,
        startsAt: conferenceSlots.startsAt,
        endsAt: conferenceSlots.endsAt,
        seriesId: conferenceSeries.id,
        teacherPersonId: conferenceSeries.teacherPersonId,
        siteId: conferenceSeries.siteId,
        title: conferenceSeries.title,
      })
      .from(conferenceSlots)
      .innerJoin(
        conferenceSeries,
        eq(conferenceSeries.id, conferenceSlots.conferenceSeriesId),
      )
      .where(eq(conferenceSlots.id, input.conferenceSlotId))
      .limit(1);

    if (!slot) throw new Error("Conference slot not found");
    if (slot.status !== "available") throw new Error("Conference slot is not available");

    const [student] = await tx
      .select({ personId: studentProfiles.personId })
      .from(studentProfiles)
      .where(eq(studentProfiles.id, input.studentProfileId))
      .limit(1);

    if (!student) throw new Error("StudentProfile not found");

    const [guardian] = await tx
      .select({ id: guardianRelationships.id })
      .from(guardianRelationships)
      .where(
        and(
          eq(guardianRelationships.guardianPersonId, context.actorPersonId),
          eq(guardianRelationships.studentPersonId, student.personId),
        ),
      )
      .limit(1);

    if (!guardian) throw new Error("Actor is not an authorized guardian");

    const [site] = await tx
      .select({ timezone: sites.timezone })
      .from(sites)
      .where(eq(sites.id, slot.siteId))
      .limit(1);

    if (!site) throw new Error("Site not found");

    const [booking] = await tx
      .insert(conferenceBookings)
      .values({
        conferenceSlotId: input.conferenceSlotId,
        studentProfileId: input.studentProfileId,
        guardianPersonId: context.actorPersonId,
        status: "booked",
      })
      .returning({ id: conferenceBookings.id });

    if (!booking) throw new Error("Failed to book Conference");

    const [event] = await tx
      .insert(calendarEvents)
      .values({
        type: "parent_teacher_conference",
        title: slot.title,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        timezone: site.timezone,
        siteId: slot.siteId,
        sourceType: "conference_booking",
        sourceId: booking.id,
        createdByPersonId: context.actorPersonId,
      })
      .returning({ id: calendarEvents.id });

    if (!event) throw new Error("Failed to create Conference calendar event");

    await tx.insert(calendarEventParticipants).values([
      {
        calendarEventId: event.id,
        participantType: "person",
        participantId: slot.teacherPersonId,
        role: "teacher",
      },
      {
        calendarEventId: event.id,
        participantType: "person",
        participantId: context.actorPersonId,
        role: "guardian",
      },
      {
        calendarEventId: event.id,
        participantType: "person",
        participantId: student.personId,
        role: "student",
      },
    ]);

    await tx
      .update(conferenceSlots)
      .set({
        status: "booked",
        calendarEventId: event.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(conferenceSlots.id, input.conferenceSlotId),
          eq(conferenceSlots.status, "available"),
        ),
      );

    await tx.insert(domainEvents).values({
      eventType: EventTypes.ConferenceBooked,
      aggregateType: "conference_booking",
      aggregateId: booking.id,
      actorPersonId: context.actorPersonId,
      payload: {
        studentProfileId: input.studentProfileId,
        slotId: input.conferenceSlotId,
        calendarEventId: event.id,
      },
    });

    await tx.insert(auditEvents).values({
      actorPersonId: context.actorPersonId,
      action: "conference.book",
      resourceType: "conference_booking",
      resourceId: booking.id,
      scope: { siteId: slot.siteId },
      after: {
        studentProfileId: input.studentProfileId,
        slotId: input.conferenceSlotId,
        status: "booked",
      },
      context: { requestId: context.requestId ?? null },
    });

    return booking.id;
  });
}

export async function queueConferenceReminder(
  context: CommandContext,
  bookingId: string,
): Promise<void> {
  assertCapability(context, "conference.remind");

  await db.transaction(async (tx) => {
    const [booking] = await tx
      .select({
        guardianPersonId: conferenceBookings.guardianPersonId,
        startsAt: conferenceSlots.startsAt,
      })
      .from(conferenceBookings)
      .innerJoin(
        conferenceSlots,
        eq(conferenceSlots.id, conferenceBookings.conferenceSlotId),
      )
      .where(eq(conferenceBookings.id, bookingId))
      .limit(1);

    if (!booking) throw new Error("Conference booking not found");

    await tx.insert(notifications).values({
      recipientPersonId: booking.guardianPersonId,
      type: "conference_reminder",
      title: "Parent-teacher conference reminder",
      body: `Your conference is scheduled for ${booking.startsAt.toISOString()}.`,
      resourceType: "conference_booking",
      resourceId: bookingId,
    });
  });
}

export async function completeConference(
  context: CommandContext,
  input: {
    bookingId: string;
    outcome: "held" | "no_show";
    note?: string;
    noteVisibility?: "staff_private" | "family_visible";
    followUp?: {
      title: string;
      description?: string;
      ownerPersonId?: string;
      dueAt?: Date;
    };
  },
): Promise<{ actionId?: string }> {
  assertCapability(context, "conference.complete");

  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        bookingId: conferenceBookings.id,
        studentProfileId: conferenceBookings.studentProfileId,
        bookingStatus: conferenceBookings.status,
        teacherPersonId: conferenceSeries.teacherPersonId,
        siteId: conferenceSeries.siteId,
      })
      .from(conferenceBookings)
      .innerJoin(
        conferenceSlots,
        eq(conferenceSlots.id, conferenceBookings.conferenceSlotId),
      )
      .innerJoin(
        conferenceSeries,
        eq(conferenceSeries.id, conferenceSlots.conferenceSeriesId),
      )
      .where(eq(conferenceBookings.id, input.bookingId))
      .limit(1);

    if (!record) throw new Error("Conference booking not found");
    assertSiteScope(context, record.siteId);

    if (
      context.actorPersonId !== record.teacherPersonId &&
      !context.capabilities.has("conference.complete.any")
    ) {
      throw new Error("Only the teacher or authorized staff may complete this conference");
    }

    await tx
      .update(conferenceBookings)
      .set({
        status: input.outcome,
        updatedAt: new Date(),
      })
      .where(eq(conferenceBookings.id, input.bookingId));

    if (input.note) {
      if (!context.actorPersonId) throw new Error("Note author is required");
      await tx.insert(conferenceNotes).values({
        conferenceBookingId: input.bookingId,
        authorPersonId: context.actorPersonId,
        visibility: input.noteVisibility ?? "staff_private",
        note: input.note,
      });
    }

    let actionId: string | undefined;
    if (input.followUp) {
      const [action] = await tx
        .insert(actions)
        .values({
          type: "conference_follow_up",
          title: input.followUp.title,
          description: input.followUp.description,
          ownerPersonId: input.followUp.ownerPersonId,
          siteId: record.siteId,
          subjectType: "student_profile",
          subjectId: record.studentProfileId,
          dueAt: input.followUp.dueAt,
          metadata: { conferenceBookingId: input.bookingId },
        })
        .returning({ id: actions.id });

      if (!action) throw new Error("Failed to create Conference follow-up Action");
      actionId = action.id;

      await tx.insert(conferenceActions).values({
        conferenceBookingId: input.bookingId,
        actionId,
      });
    }

    if (input.outcome === "held") {
      await tx.insert(domainEvents).values({
        eventType: EventTypes.ConferenceHeld,
        aggregateType: "conference_booking",
        aggregateId: input.bookingId,
        actorPersonId: context.actorPersonId,
        payload: {
          studentProfileId: record.studentProfileId,
          actionId: actionId ?? null,
        },
      });
    }

    await tx.insert(auditEvents).values({
      actorPersonId: context.actorPersonId,
      action: "conference.complete",
      resourceType: "conference_booking",
      resourceId: input.bookingId,
      scope: { siteId: record.siteId },
      before: { status: record.bookingStatus },
      after: {
        status: input.outcome,
        noteVisibility: input.note ? input.noteVisibility ?? "staff_private" : null,
        actionId: actionId ?? null,
      },
      context: { requestId: context.requestId ?? null },
    });

    return actionId ? { actionId } : {};
  });
}

import { db } from "@/db/client";
import {
actions,
conferenceBookings,
conferenceNotes,
conferenceSeries,
conferenceSlots,
enrollments,
guardianRelationships,
programs,
sections,
sites,
studentProfiles,
} from "@/db/schema";
import {
assertCapability,
assertSiteScope,
AuthorizationError,
type CommandContext,
} from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { EventTypes } from "@/domain/event-types";
import {
cancelProjection,
publishProjection,
rescheduleProjection,
} from "@/platform/calendar/projection";
import { emitEvent,writeAudit } from "@/platform/mutation";
import {
claimAvailableSlot,
releaseClaimedSlot,
} from "@/platform/scheduling/booking";
import { scheduleReminder } from "@/platform/scheduling/reminders";
import { materializeSlots } from "@/platform/scheduling/slots";
import { and,eq,inArray } from "drizzle-orm";
import { conferenceWindowProblem } from "./eligibility";

type ConferenceTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

    const slots = materializeSlots({
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      slotMinutes,
    }).map((slot) => ({
      conferenceSeriesId: series.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      status: "available" as const,
    }));

    if (slots.length === 0) throw new Error("Conference series has no valid slots");
    await tx.insert(conferenceSlots).values(slots);

    await writeAudit(tx, context, {
      action: "conference.series.create",
      entityType: "conference_series",
      entityId: series.id,
      scope: { siteId: input.siteId, sectionId: input.sectionId },
      after: {
        status: "published", teacherPersonId: input.teacherPersonId,
        startsAt: input.startsAt.toISOString(), endsAt: input.endsAt.toISOString(),
        slotMinutes, slotCount: slots.length,
      },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ConferenceSeriesCreated,
      aggregateType: "conference_series",
      aggregateId: series.id,
      actorPersonId: context.actorPersonId,
      siteId: input.siteId,
      sectionId: input.sectionId,
      payload: { teacherPersonId: input.teacherPersonId, slotCount: slots.length },
    });
    return series.id;
  });
}

async function assertEnrollmentEligibility(
  tx: ConferenceTx,
  input: {
    studentProfileId: string;
    siteId: string;
    sectionId: string | null;
    programIds: string[];
  },
): Promise<void> {
  const [siteEnrollment] = await tx
    .select({ id: enrollments.id })
    .from(enrollments)
    .innerJoin(programs, eq(programs.id, enrollments.programId))
    .where(
      and(
        eq(enrollments.studentProfileId, input.studentProfileId),
        eq(enrollments.kind, "program"),
        eq(enrollments.status, "active"),
        eq(programs.status, "active"),
        eq(programs.siteId, input.siteId),
        inArray(programs.id, input.programIds),
      ),
    )
    .limit(1);

  if (!siteEnrollment) {
    throw new AuthorizationError("child enrollment at selected school");
  }

  if (input.sectionId) {
    const [sectionEnrollment] = await tx
      .select({ id: enrollments.id })
      .from(enrollments)
      .innerJoin(sections, eq(sections.id, enrollments.sectionId))
      .where(
        and(
          eq(enrollments.studentProfileId, input.studentProfileId),
          eq(enrollments.sectionId, input.sectionId),
          eq(enrollments.status, "active"),
          eq(enrollments.kind, "section"),
          eq(sections.active, true),
          eq(sections.siteId, input.siteId),
          inArray(enrollments.programId, input.programIds),
          inArray(sections.programId, input.programIds),
        ),
      )
      .limit(1);

    if (!sectionEnrollment) {
      throw new AuthorizationError(
        "child is not enrolled in the appointment section",
      );
    }
  }
}

/** Project a booking onto the shared calendar: event + teacher/guardian/student participants. */
async function createConferenceCalendarEvent(
  tx: ConferenceTx,
  input: {
    bookingId: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    timezone: string;
    siteId: string;
    teacherPersonId: string;
    guardianPersonId: string;
    studentPersonId: string;
  },
): Promise<string> {
  return publishProjection(tx, {
    sourceType: "conference_booking",
    sourceId: input.bookingId,
    type: "parent_teacher_conference",
    title: input.title,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timezone: input.timezone,
    scope: { siteId: input.siteId },
    createdByPersonId: input.guardianPersonId,
    participants: [
      { personId: input.teacherPersonId, role: "teacher" },
      { personId: input.guardianPersonId, role: "guardian" },
      { personId: input.studentPersonId, role: "student" },
    ],
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
  const actorPersonId = context.actorPersonId;

  return db.transaction(async (tx) => {
    const [slot] = await tx
      .select({
        slotId: conferenceSlots.id,
        status: conferenceSlots.status,
        startsAt: conferenceSlots.startsAt,
        endsAt: conferenceSlots.endsAt,
        seriesId: conferenceSeries.id,
        seriesStatus: conferenceSeries.status,
        sectionId: conferenceSeries.sectionId,
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
    if (conferenceWindowProblem(slot)) {
      throw new Error("Office-hour slot not available");
    }
    if (!context.scope.siteIds?.includes(slot.siteId)) {
      throw new AuthorizationError("conference site scope");
    }

    const [student] = await tx
      .select({ personId: studentProfiles.personId })
      .from(studentProfiles)
      .where(eq(studentProfiles.id, input.studentProfileId))
      .limit(1);

    if (!student) throw new Error("StudentProfile not found");

    const [guardian] = await tx
      .select({ id: guardianRelationships.id })
      .from(guardianRelationships)
      .where(guardianRelationshipPredicate({
        guardianPersonId: actorPersonId,
        studentPersonId: student.personId,
        access: "academic",
      }))
      .limit(1);

    if (!guardian) throw new Error("Actor is not an authorized guardian");

    await assertEnrollmentEligibility(tx, {
      studentProfileId: input.studentProfileId,
      siteId: slot.siteId,
      sectionId: slot.sectionId,
      programIds: context.scope.programIds ?? [],
    });

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
        guardianPersonId: actorPersonId,
        status: "booked",
      })
      .returning({ id: conferenceBookings.id });

    if (!booking) throw new Error("Failed to book Conference");

    const eventId = await createConferenceCalendarEvent(tx, {
      bookingId: booking.id,
      title: slot.title,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      timezone: site.timezone,
      siteId: slot.siteId,
      teacherPersonId: slot.teacherPersonId,
      guardianPersonId: actorPersonId,
      studentPersonId: student.personId,
    });

    await claimAvailableSlot(tx, input.conferenceSlotId, {
      calendarEventId: eventId,
    });

    await emitEvent(tx, {
      eventType: EventTypes.ConferenceBooked,
      aggregateType: "conference_booking",
      aggregateId: booking.id,
      actorPersonId,
      payload: {
        studentProfileId: input.studentProfileId,
        slotId: input.conferenceSlotId,
        calendarEventId: eventId,
      },
    });

    await writeAudit(tx, context, {
      action: "conference.book",
      entityType: "conference_booking",
      entityId: booking.id,
      scope: { siteId: slot.siteId },
      after: {
        studentProfileId: input.studentProfileId,
        slotId: input.conferenceSlotId,
        status: "booked",
      },
    });

    return booking.id;
  });
}

/**
 * Move a guardian-owned future booking to another slot in the same published
 * series. Rescheduling is a re-booking, so it requires the same
 * "conference.book" capability. The calendar projection moves with the
 * booking: the old slot is released and the new slot claimed with the same
 * calendar event (created for legacy bookings that predate the projection).
 */
export async function rescheduleConferenceBooking(
  context: CommandContext,
  input: {
    bookingId: string;
    newSlotId: string;
  },
): Promise<void> {
  assertCapability(context, "conference.book");
  if (!context.actorPersonId) throw new Error("Guardian identity is required");
  const actorPersonId = context.actorPersonId;

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        bookingId: conferenceBookings.id,
        studentProfileId: conferenceBookings.studentProfileId,
        oldSlotId: conferenceSlots.id,
        startsAt: conferenceSlots.startsAt,
        seriesId: conferenceSlots.conferenceSeriesId,
        seriesStatus: conferenceSeries.status,
        seriesTitle: conferenceSeries.title,
        sectionId: conferenceSeries.sectionId,
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
      .where(
        and(
          eq(conferenceBookings.id, input.bookingId),
          eq(conferenceBookings.guardianPersonId, actorPersonId),
          eq(conferenceBookings.status, "booked"),
        ),
      )
      .for("update")
      .limit(1);

    if (
      !current ||
      conferenceWindowProblem({
        seriesStatus: current.seriesStatus,
        startsAt: current.startsAt,
      })
    ) {
      throw new AuthorizationError("future published guardian booking");
    }
    if (!context.scope.siteIds?.includes(current.siteId)) {
      throw new AuthorizationError("conference site scope");
    }

    const [student] = await tx
      .select({ personId: studentProfiles.personId })
      .from(studentProfiles)
      .where(eq(studentProfiles.id, current.studentProfileId))
      .limit(1);

    if (!student) throw new Error("StudentProfile not found");

    const [linkedChild] = await tx
      .select({ id: guardianRelationships.id })
      .from(guardianRelationships)
      .where(guardianRelationshipPredicate({
        guardianPersonId: actorPersonId,
        studentPersonId: student.personId,
        access: "academic",
      }))
      .limit(1);

    if (!linkedChild) {
      throw new AuthorizationError("current guardian relationship");
    }

    await assertEnrollmentEligibility(tx, {
      studentProfileId: current.studentProfileId,
      siteId: current.siteId,
      sectionId: current.sectionId,
      programIds: context.scope.programIds ?? [],
    });

    if (current.oldSlotId === input.newSlotId) return;

    const [nextSlot] = await tx
      .select({
        id: conferenceSlots.id,
        seriesId: conferenceSlots.conferenceSeriesId,
        startsAt: conferenceSlots.startsAt,
        endsAt: conferenceSlots.endsAt,
      })
      .from(conferenceSlots)
      .where(eq(conferenceSlots.id, input.newSlotId))
      .limit(1);

    if (
      !nextSlot ||
      nextSlot.seriesId !== current.seriesId ||
      nextSlot.startsAt <= new Date()
    ) {
      throw new Error("Replacement slot is no longer available");
    }

    const rescheduledEventId = await rescheduleProjection(tx, {
      sourceType: "conference_booking",
      sourceId: current.bookingId,
      startsAt: nextSlot.startsAt,
      endsAt: nextSlot.endsAt,
    });

    let calendarEventId: string;
    if (rescheduledEventId) {
      calendarEventId = rescheduledEventId;
    } else {
      const [site] = await tx
        .select({ timezone: sites.timezone })
        .from(sites)
        .where(eq(sites.id, current.siteId))
        .limit(1);

      if (!site) throw new Error("Site not found");

      calendarEventId = await createConferenceCalendarEvent(tx, {
        bookingId: current.bookingId,
        title: current.seriesTitle,
        startsAt: nextSlot.startsAt,
        endsAt: nextSlot.endsAt,
        timezone: site.timezone,
        siteId: current.siteId,
        teacherPersonId: current.teacherPersonId,
        guardianPersonId: actorPersonId,
        studentPersonId: student.personId,
      });
    }

    await claimAvailableSlot(tx, input.newSlotId, { calendarEventId });

    await tx
      .update(conferenceBookings)
      .set({ conferenceSlotId: nextSlot.id, updatedAt: new Date() })
      .where(
        and(
          eq(conferenceBookings.id, current.bookingId),
          eq(conferenceBookings.conferenceSlotId, current.oldSlotId),
        ),
      );

    await releaseClaimedSlot(tx, current.oldSlotId);

    await emitEvent(tx, {
      eventType: EventTypes.ConferenceRescheduled,
      aggregateType: "conference_booking",
      aggregateId: current.bookingId,
      actorPersonId,
      siteId: current.siteId,
      payload: {
        studentProfileId: current.studentProfileId,
        previousSlotId: current.oldSlotId,
        slotId: nextSlot.id,
        calendarEventId,
      },
    });

    await writeAudit(tx, context, {
      action: "conference.reschedule",
      entityType: "conference_booking",
      entityId: current.bookingId,
      scope: { siteId: current.siteId },
      before: { slotId: current.oldSlotId },
      after: { slotId: nextSlot.id },
    });
  });
}

/**
 * Cancel an active booking and free its slot. The booking guardian cancels
 * with the same "conference.book" capability used to book; the owning teacher
 * cancels with "conference.manage". Cancelling an already-cancelled booking
 * is an idempotent no-op so retries and double-clicks stay safe; completing a
 * cancelled booking is unchanged. Deferred reminder delivery is a documented
 * schema limitation, so cancellation only stops the slot and calendar
 * projection (see the TODO on the reminders platform).
 */
export async function cancelConferenceBooking(
  context: CommandContext,
  input: {
    bookingId: string;
    reason?: string;
  },
): Promise<void> {
  if (!context.actorPersonId) throw new Error("Actor identity is required");
  const actorPersonId = context.actorPersonId;

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        bookingId: conferenceBookings.id,
        status: conferenceBookings.status,
        studentProfileId: conferenceBookings.studentProfileId,
        guardianPersonId: conferenceBookings.guardianPersonId,
        slotId: conferenceSlots.id,
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
      .for("update")
      .limit(1);

    if (!current) throw new Error("Conference booking not found");
    assertSiteScope(context, current.siteId);

    if (actorPersonId === current.guardianPersonId) {
      assertCapability(context, "conference.book");
    } else if (actorPersonId === current.teacherPersonId) {
      assertCapability(context, "conference.manage");
    } else {
      throw new AuthorizationError("conference booking owner");
    }

    if (current.status === "cancelled") return;
    if (current.status !== "booked") {
      throw new Error("Only a booked conference can be cancelled");
    }

    await tx
      .update(conferenceBookings)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(conferenceBookings.id, current.bookingId));

    await cancelProjection(tx, {
      sourceType: "conference_booking",
      sourceId: current.bookingId,
      reason: input.reason,
    });

    await releaseClaimedSlot(tx, current.slotId);

    await emitEvent(tx, {
      eventType: EventTypes.ConferenceCancelled,
      aggregateType: "conference_booking",
      aggregateId: current.bookingId,
      actorPersonId,
      siteId: current.siteId,
      payload: {
        studentProfileId: current.studentProfileId,
        slotId: current.slotId,
        cancelledBy: actorPersonId === current.guardianPersonId ? "guardian" : "teacher",
      },
    });

    await writeAudit(tx, context, {
      action: "conference.cancel",
      entityType: "conference_booking",
      entityId: current.bookingId,
      scope: { siteId: current.siteId },
      before: { status: current.status, slotId: current.slotId },
      after: { status: "cancelled" },
    });
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
      .where(eq(conferenceBookings.id, bookingId))
      .limit(1);

    if (!booking) throw new Error("Conference booking not found");
    assertSiteScope(context, booking.siteId);

    const notificationId = await scheduleReminder(tx, {
      recipientPersonId: booking.guardianPersonId,
      type: "conference_reminder",
      title: "Parent-teacher conference reminder",
      body: `Your conference is scheduled for ${booking.startsAt.toISOString()}.`,
      resourceType: "conference_booking",
      resourceId: bookingId,
    });
    await writeAudit(tx, context, {
      action: "conference.reminder.queue",
      entityType: "conference_booking",
      entityId: bookingId,
      scope: { siteId: booking.siteId },
      after: { notificationId },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ConferenceReminderQueued,
      aggregateType: "conference_booking",
      aggregateId: bookingId,
      actorPersonId: context.actorPersonId,
      siteId: booking.siteId,
      payload: { notificationId },
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
      await writeAudit(tx, context, {
        action: "action.create",
        entityType: "action",
        entityId: action.id,
        scope: { siteId: record.siteId },
        after: { type: "conference_follow_up", conferenceBookingId: input.bookingId },
      });
      await emitEvent(tx, {
        eventType: EventTypes.ActionCreated,
        aggregateType: "action",
        aggregateId: action.id,
        actorPersonId: context.actorPersonId,
        siteId: record.siteId,
        payload: { type: "conference_follow_up", conferenceBookingId: input.bookingId },
      });
    }

    await emitEvent(tx, {
      eventType: input.outcome === "held" ? EventTypes.ConferenceHeld : EventTypes.ConferenceNoShowRecorded,
      aggregateType: "conference_booking",
      aggregateId: input.bookingId,
      actorPersonId: context.actorPersonId,
      payload: {
        studentProfileId: record.studentProfileId,
        actionId: actionId ?? null,
      },
    });

    await writeAudit(tx, context, {
      action: "conference.complete",
      entityType: "conference_booking",
      entityId: input.bookingId,
      scope: { siteId: record.siteId },
      before: { status: record.bookingStatus },
      after: {
        status: input.outcome,
        noteVisibility: input.note ? input.noteVisibility ?? "staff_private" : null,
        actionId: actionId ?? null,
      },
    });

    return actionId ? { actionId } : {};
  });
}

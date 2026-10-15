import { describe, expect, it } from "vitest";

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("GF39 parent-teacher conferences", () => {
  it("creates slots, authorizes guardian booking, fuses calendar participants, reminds, and records follow-up", async () => {
    const [{ db }, schema, { eq }, conferences] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
      import("@/modules/conferences/gf39-service"),
    ]);

    const suffix = crypto.randomUUID().slice(0, 8);

    const [org] = await db.insert(schema.organizations).values({
      type: "christian_school",
      name: `Conference School ${suffix}`,
      slug: `conference-school-${suffix}`,
    }).returning();

    const [site] = await db.insert(schema.sites).values({
      organizationId: org.id,
      name: "Main Campus",
      slug: `main-${suffix}`,
      timezone: "America/New_York",
    }).returning();

    const people = await db.insert(schema.people).values([
      { legalFirstName: "Taylor", legalLastName: `Teacher-${suffix}` },
      { legalFirstName: "Jordan", legalLastName: `Guardian-${suffix}` },
      { legalFirstName: "Morgan", legalLastName: `Student-${suffix}` },
    ]).returning();

    const teacher = people[0]!;
    const guardian = people[1]!;
    const studentPerson = people[2]!;

    const [student] = await db.insert(schema.studentProfiles).values({
      personId: studentPerson.id,
      gradeLevel: "8",
    }).returning();

    await db.insert(schema.guardianRelationships).values({
      guardianPersonId: guardian.id,
      studentPersonId: studentPerson.id,
      relationshipLabel: "parent",
    });

    const teacherContext = {
      actorPersonId: teacher.id,
      capabilities: new Set([
        "conference.manage",
        "conference.remind",
        "conference.complete",
      ]),
      scope: { siteIds: [site.id] },
      requestId: `gf39-teacher-${suffix}`,
    };

    const seriesId = await conferences.createConferenceSeries(teacherContext, {
      siteId: site.id,
      teacherPersonId: teacher.id,
      title: "Fall Parent-Teacher Conferences",
      startsAt: new Date("2027-11-10T22:00:00.000Z"),
      endsAt: new Date("2027-11-10T23:00:00.000Z"),
      slotMinutes: 20,
    });

    const slots = await db.select().from(schema.conferenceSlots)
      .where(eq(schema.conferenceSlots.conferenceSeriesId, seriesId));

    expect(slots).toHaveLength(3);
    expect(slots.every((slot) => slot.status === "available")).toBe(true);

    const guardianContext = {
      actorPersonId: guardian.id,
      capabilities: new Set(["conference.book"]),
      scope: {},
      requestId: `gf39-guardian-${suffix}`,
    };

    const bookingId = await conferences.bookConference(guardianContext, {
      conferenceSlotId: slots[0]!.id,
      studentProfileId: student.id,
    });

    const [booking] = await db.select().from(schema.conferenceBookings)
      .where(eq(schema.conferenceBookings.id, bookingId));
    expect(booking.status).toBe("booked");
    expect(booking.guardianPersonId).toBe(guardian.id);

    const [bookedSlot] = await db.select().from(schema.conferenceSlots)
      .where(eq(schema.conferenceSlots.id, slots[0]!.id));
    expect(bookedSlot.status).toBe("booked");
    expect(bookedSlot.calendarEventId).toBeTruthy();

    const participants = await db.select().from(schema.calendarEventParticipants)
      .where(eq(schema.calendarEventParticipants.calendarEventId, bookedSlot.calendarEventId!));
    expect(participants).toHaveLength(3);
    expect(participants.map((p) => p.role).sort()).toEqual(["guardian", "student", "teacher"]);

    await expect(
      conferences.bookConference(guardianContext, {
        conferenceSlotId: slots[0]!.id,
        studentProfileId: student.id,
      }),
    ).rejects.toThrow("not available");

    await conferences.queueConferenceReminder(teacherContext, bookingId);

    const reminders = await db.select().from(schema.notifications)
      .where(eq(schema.notifications.recipientPersonId, guardian.id));
    expect(reminders.some((n) => n.type === "conference_reminder")).toBe(true);

    const completed = await conferences.completeConference(teacherContext, {
      bookingId,
      outcome: "held",
      note: "Discussed progress and agreed on a reading goal.",
      noteVisibility: "family_visible",
      followUp: {
        title: "Check reading goal in two weeks",
        ownerPersonId: teacher.id,
      },
    });

    expect(completed.actionId).toBeTruthy();

    const notes = await db.select().from(schema.conferenceNotes)
      .where(eq(schema.conferenceNotes.conferenceBookingId, bookingId));
    expect(notes).toHaveLength(1);
    expect(notes[0]!.visibility).toBe("family_visible");

    const [followUp] = await db.select().from(schema.actions)
      .where(eq(schema.actions.id, completed.actionId!));
    expect(followUp.subjectType).toBe("student_profile");
    expect(followUp.subjectId).toBe(student.id);

    const [completedBooking] = await db.select().from(schema.conferenceBookings)
      .where(eq(schema.conferenceBookings.id, bookingId));
    expect(completedBooking.status).toBe("held");
  });
});

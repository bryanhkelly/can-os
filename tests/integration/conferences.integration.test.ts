import { describe, expect, it } from "vitest";
import { expectEvidenceFailure, expectMutationEvidence } from "./helpers/mutation-evidence";

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("GF39 parent-teacher conferences", () => {
  it("creates slots, authorizes guardian booking, fuses calendar participants, reminds, and records follow-up", async () => {
    const [{ db }, schema, { and, eq }, conferences] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
      import("@/modules/conferences/conference-service"),
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

    const [jurisdiction] = await db.insert(schema.jurisdictions).values({
      code: `conferences-${suffix}`, name: "Conference Test",
    }).returning();
    const [program] = await db.insert(schema.programs).values({
      organizationId: org.id, siteId: site.id, jurisdictionId: jurisdiction!.id,
      type: "full_school", name: "Conference Program", slug: suffix, gradeRange: { min: "6", max: "12" },
      academicProviderOrganizationId: org.id, creditIssuingOrganizationId: org.id,
    }).returning();
    const { createAcademicTimeFixture } = await import("./helpers/academic-time");
    const academicTime = await createAcademicTimeFixture({
      organizationId: org.id, programId: program!.id, siteId: site.id, suffix,
    });
    const [course] = await db.insert(schema.courseTemplates).values({
      owningOrganizationId: org.id, code: suffix, title: "Conference Course", subject: "Science",
    }).returning();
    const [version] = await db.insert(schema.courseTemplateVersions).values({
      courseTemplateId: course!.id, version: 1,
    }).returning();
    const [section] = await db.insert(schema.sections).values({
      programId: program!.id, siteId: site.id, courseTemplateVersionId: version!.id,
      code: suffix, title: "Conference Section", termId: academicTime.term.id,
    }).returning();
    await db.insert(schema.sectionTeachers).values({ sectionId: section!.id, personId: teacher.id });

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

    const seriesInput = {
      siteId: site.id,
      teacherPersonId: teacher.id,
      sectionId: section!.id,
      title: "Fall Parent-Teacher Conferences",
      startsAt: new Date("2027-11-10T22:00:00.000Z"),
      endsAt: new Date("2027-11-10T23:00:00.000Z"),
      slotMinutes: 20,
    };
    for (const writer of ["writeAudit", "emitEvent"] as const) {
      const title = `Rollback ${writer}-${suffix}`;
      await expectEvidenceFailure(db, writer, () => conferences.createConferenceSeries(teacherContext, {
        ...seriesInput, title,
      }));
      expect(await db.select().from(schema.conferenceSeries)
        .where(eq(schema.conferenceSeries.title, title))).toEqual([]);
    }
    const seriesId = await conferences.createConferenceSeries(teacherContext, seriesInput);

    const slots = await db.select().from(schema.conferenceSlots)
      .where(eq(schema.conferenceSlots.conferenceSeriesId, seriesId));

    expect(slots).toHaveLength(3);
    expect(slots.every((slot) => slot.status === "available")).toBe(true);

    const guardianContext = {
      actorPersonId: guardian.id,
      capabilities: new Set(["conference.book"]),
      scope: { siteIds: [site.id], programIds: [program!.id] },
      requestId: `gf39-guardian-${suffix}`,
    };

    const bookingInput = {
      conferenceSlotId: slots[0]!.id,
      studentProfileId: student.id,
    };
    for (const scope of [{}, { siteIds: [] }, { siteIds: [crypto.randomUUID()] }]) {
      await expect(conferences.bookConference({ ...guardianContext, scope }, bookingInput))
        .rejects.toThrow("conference site scope");
    }
    await expect(conferences.bookConference(guardianContext, bookingInput))
      .rejects.toThrow("child enrollment at selected school");
    await db.insert(schema.enrollments).values({
      studentProfileId: student.id, organizationId: org.id, programId: program!.id,
      kind: "program", status: "active", schoolYearId: academicTime.schoolYear.id,
    });
    for (const programIds of [[], [crypto.randomUUID()]]) {
      await expect(conferences.bookConference({
        ...guardianContext, scope: { siteIds: [site.id], programIds },
      }, bookingInput)).rejects.toThrow("child enrollment at selected school");
    }
    await expect(conferences.bookConference(guardianContext, bookingInput))
      .rejects.toThrow("appointment section");
    const [enrollment] = await db.insert(schema.enrollments).values({
      studentProfileId: student.id, organizationId: org.id, programId: program!.id,
      sectionId: section!.id, kind: "section", status: "active", schoolYearId: academicTime.schoolYear.id,
    }).returning();
    await db.update(schema.sections).set({ active: false }).where(eq(schema.sections.id, section!.id));
    await expect(conferences.bookConference(guardianContext, bookingInput)).rejects.toThrow("appointment section");
    await db.update(schema.sections).set({ active: true }).where(eq(schema.sections.id, section!.id));
    const bookingId = await conferences.bookConference(guardianContext, bookingInput);

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

    const move = { bookingId, newSlotId: slots[1]!.id };
    for (const scope of [
      {}, { siteIds: [] }, { siteIds: [site.id], programIds: [] },
      { siteIds: [site.id], programIds: [crypto.randomUUID()] },
    ]) {
      await expect(conferences.rescheduleConferenceBooking({ ...guardianContext, scope }, move))
        .rejects.toThrow();
    }
    await db.update(schema.enrollments).set({ status: "withdrawn" })
      .where(eq(schema.enrollments.id, enrollment!.id));
    await expect(conferences.rescheduleConferenceBooking(guardianContext, move))
      .rejects.toThrow("appointment section");
    const [unmoved] = await db.select().from(schema.conferenceBookings)
      .where(eq(schema.conferenceBookings.id, bookingId));
    expect(unmoved?.conferenceSlotId).toBe(slots[0]!.id);
    await db.update(schema.enrollments).set({ status: "active" }).where(eq(schema.enrollments.id, enrollment!.id));
    await conferences.rescheduleConferenceBooking(guardianContext, move);
    const [moved] = await db.select().from(schema.conferenceBookings)
      .where(eq(schema.conferenceBookings.id, bookingId));
    expect(moved?.conferenceSlotId).toBe(slots[1]!.id);
    const [released] = await db.select().from(schema.conferenceSlots)
      .where(eq(schema.conferenceSlots.id, slots[0]!.id));
    expect(released?.status).toBe("available");
    const calendar = await db.select().from(schema.calendarEvents).where(and(
      eq(schema.calendarEvents.sourceType, "conference_booking"),
      eq(schema.calendarEvents.sourceId, bookingId),
    ));
    expect(calendar).toHaveLength(1);
    expect(calendar[0]!.startsAt.toISOString()).toBe(slots[1]!.startsAt.toISOString());

    await expect(conferences.queueConferenceReminder({
      ...teacherContext, scope: { siteIds: [crypto.randomUUID()] },
    }, bookingId)).rejects.toThrow("site scope");
    for (const writer of ["writeAudit", "emitEvent"] as const) {
      await expectEvidenceFailure(db, writer, () => conferences.queueConferenceReminder(teacherContext, bookingId));
      expect(await db.select().from(schema.notifications)
        .where(eq(schema.notifications.resourceId, bookingId))).toEqual([]);
    }
    await conferences.queueConferenceReminder(teacherContext, bookingId);

    const reminders = await db.select().from(schema.notifications)
      .where(eq(schema.notifications.recipientPersonId, guardian.id));
    expect(reminders.some((n) => n.type === "conference_reminder")).toBe(true);

    const completionInput = {
      bookingId,
      outcome: "held" as const,
      note: "Discussed progress and agreed on a reading goal.",
      noteVisibility: "family_visible" as const,
      followUp: {
        title: "Check reading goal in two weeks",
        ownerPersonId: teacher.id,
      },
    };
    for (const writer of ["writeAudit", "emitEvent"] as const) {
      await expectEvidenceFailure(db, writer, () => conferences.completeConference(teacherContext, completionInput));
      expect(await db.select().from(schema.conferenceNotes)
        .where(eq(schema.conferenceNotes.conferenceBookingId, bookingId))).toEqual([]);
      expect(await db.select().from(schema.actions)
        .where(eq(schema.actions.subjectId, student.id))).toEqual([]);
      const [unchanged] = await db.select().from(schema.conferenceBookings)
        .where(eq(schema.conferenceBookings.id, bookingId));
      expect(unchanged?.status).toBe("booked");
    }
    const completed = await conferences.completeConference(teacherContext, completionInput);

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
    for (const [resourceType, resourceId, action, eventType] of [
      ["conference_series", seriesId, "conference.series.create", "ConferenceSeriesCreated"],
      ["conference_booking", bookingId, "conference.reminder.queue", "ConferenceReminderQueued"],
      ["conference_booking", bookingId, "conference.complete", "ConferenceHeld"],
      ["action", completed.actionId!, "action.create", "ActionCreated"],
    ] as const) {
      const evidence = await expectMutationEvidence(db, {
        resourceType, resourceId, action, eventType,
        actorPersonId: teacher.id, requestId: teacherContext.requestId,
        scope: { siteId: site.id },
      });
      expect(JSON.stringify(evidence)).not.toContain(completionInput.note);
      expect(JSON.stringify(evidence)).not.toContain(completionInput.followUp.title);
    }
    const noShowBooking = await conferences.bookConference(guardianContext, {
      conferenceSlotId: slots[2]!.id, studentProfileId: student.id,
    });
    await conferences.completeConference(teacherContext, { bookingId: noShowBooking, outcome: "no_show" });
    await expectMutationEvidence(db, {
      resourceType: "conference_booking", resourceId: noShowBooking, action: "conference.complete",
      eventType: "ConferenceNoShowRecorded", actorPersonId: teacher.id,
      requestId: teacherContext.requestId, scope: { siteId: site.id },
    });
  });
});

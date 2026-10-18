import { describe, expect, it } from "vitest";

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("GF4 attendance + parent excuse", () => {
  it("records an idempotent absence and preserves it when an approved excuse supersedes it", async () => {
    const [{ db }, schema, { and, eq }, attendance] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
      import("@/modules/attendance/attendance-service"),
    ]);

    const suffix = crypto.randomUUID().slice(0, 8);

    const [jurisdiction] = await db
      .insert(schema.jurisdictions)
      .values({
        code: `gf4-${suffix}`,
        name: "GF4 Test Jurisdiction",
      })
      .returning();

    const [canOrg] = await db
      .insert(schema.organizations)
      .values({
        type: "can_network",
        name: `CAN GF4 ${suffix}`,
        slug: `can-gf4-${suffix}`,
      })
      .returning();

    const [hostOrg] = await db
      .insert(schema.organizations)
      .values({
        type: "christian_school",
        name: `Attendance School ${suffix}`,
        slug: `attendance-school-${suffix}`,
      })
      .returning();

    const [site] = await db
      .insert(schema.sites)
      .values({
        organizationId: hostOrg.id,
        name: "Main Campus",
        slug: `main-${suffix}`,
      })
      .returning();

    const [program] = await db
      .insert(schema.programs)
      .values({
        organizationId: hostOrg.id,
        siteId: site.id,
        jurisdictionId: jurisdiction.id,
        type: "high_school_extension",
        status: "active",
        name: "CAN High School",
        slug: `hs-${suffix}`,
        gradeRange: { min: "9", max: "12" },
        deliveryModel: { onsite: true, asynchronous: true, onsiteDaysPerWeek: 2 },
        hostOrganizationId: hostOrg.id,
        academicProviderOrganizationId: canOrg.id,
        creditIssuingOrganizationId: canOrg.id,
      })
      .returning();

    const people = await db
      .insert(schema.people)
      .values([
        {
          legalFirstName: "Sam",
          legalLastName: `Student-${suffix}`,
        },
        {
          legalFirstName: "Pat",
          legalLastName: `Parent-${suffix}`,
          email: `parent-gf4-${suffix}@example.com`,
        },
        {
          legalFirstName: "Riley",
          legalLastName: `Site-${suffix}`,
          email: `site-gf4-${suffix}@example.com`,
        },
      ])
      .returning();

    const studentPerson = people[0]!;
    const guardian = people[1]!;
    const siteOperator = people[2]!;

    const [student] = await db
      .insert(schema.studentProfiles)
      .values({
        personId: studentPerson.id,
        gradeLevel: "10",
      })
      .returning();

    await db.insert(schema.guardianRelationships).values({
      guardianPersonId: guardian.id,
      studentPersonId: studentPerson.id,
      relationshipLabel: "parent",
      canSubmitAttendanceExcuse: true,
    });

    const siteContext = {
      actorPersonId: siteOperator.id,
      role: "registrar",
      capabilities: new Set([
        "attendance.write",
        "attendance.excuse.review",
      ]),
      scope: {
        organizationIds: [hostOrg.id],
        siteIds: [site.id],
        programIds: [program.id],
      },
      requestId: `gf4-site-${suffix}`,
    };

    const occurrenceKey = `student-${student.id}:2027-09-14:morning-checkin`;
    const sourceKey = `device-write-${suffix}`;

    const absentId = await attendance.recordAttendance(siteContext, {
      studentProfileId: student.id,
      programId: program.id,
      siteId: site.id,
      occurrenceKey,
      status: "absent",
      expectedAt: new Date("2027-09-14T15:30:00.000Z"),
      sourceKey,
      metadata: { offlineCaptured: true },
    });

    const retryAbsentId = await attendance.recordAttendance(siteContext, {
      studentProfileId: student.id,
      programId: program.id,
      siteId: site.id,
      occurrenceKey,
      status: "absent",
      expectedAt: new Date("2027-09-14T15:30:00.000Z"),
      sourceKey,
      metadata: { offlineCaptured: true },
    });

    expect(retryAbsentId).toBe(absentId);

    const sameSourceRows = await db
      .select()
      .from(schema.attendanceEvents)
      .where(eq(schema.attendanceEvents.sourceKey, sourceKey));

    expect(sameSourceRows).toHaveLength(1);
    expect(sameSourceRows[0]!.status).toBe("absent");

    const guardianNotifications = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.recipientPersonId, guardian.id));

    expect(
      guardianNotifications.some(
        (notification) => notification.type === "student_absent",
      ),
    ).toBe(true);

    const guardianContext = {
      actorPersonId: guardian.id,
      role: "guardian",
      capabilities: new Set(["attendance.excuse.submit"]),
      scope: { programIds: [program.id] },
      requestId: `gf4-guardian-${suffix}`,
    };

    const excuseId = await attendance.submitAttendanceExcuse(
      guardianContext,
      {
        attendanceEventId: absentId,
        reason: "Medical appointment",
      },
    );

    const excuseRetryId = await attendance.submitAttendanceExcuse(
      guardianContext,
      {
        attendanceEventId: absentId,
        reason: "Duplicate browser retry",
      },
    );

    expect(excuseRetryId).toBe(excuseId);

    const decision = await attendance.reviewAttendanceExcuse(siteContext, {
      excuseId,
      decision: "approved",
      reviewNote: "Excuse accepted.",
    });

    expect(decision.correctionAttendanceEventId).toBeTruthy();

    const original = (
      await db
        .select()
        .from(schema.attendanceEvents)
        .where(eq(schema.attendanceEvents.id, absentId))
    )[0]!;

    const correction = (
      await db
        .select()
        .from(schema.attendanceEvents)
        .where(
          eq(
            schema.attendanceEvents.id,
            decision.correctionAttendanceEventId!,
          ),
        )
    )[0]!;

    expect(original.status).toBe("absent");
    expect(correction.status).toBe("excused");
    expect(correction.supersedesAttendanceEventId).toBe(original.id);
    expect(correction.expectedAt.toISOString()).toBe(
      original.expectedAt.toISOString(),
    );

    const retryDecision = await attendance.reviewAttendanceExcuse(
      siteContext,
      {
        excuseId,
        decision: "approved",
        reviewNote: "Retry",
      },
    );

    expect(retryDecision.correctionAttendanceEventId).toBe(
      decision.correctionAttendanceEventId,
    );

    const corrections = await db
      .select()
      .from(schema.attendanceEvents)
      .where(
        eq(schema.attendanceEvents.supersedesAttendanceEventId, original.id),
      );

    expect(corrections).toHaveLength(1);

    const approvalEvents = await db
      .select()
      .from(schema.domainEvents)
      .where(
        and(
          eq(schema.domainEvents.eventType, "AttendanceExcuseApproved"),
          eq(schema.domainEvents.aggregateId, excuseId),
        ),
      );

    expect(approvalEvents).toHaveLength(1);
  });
});

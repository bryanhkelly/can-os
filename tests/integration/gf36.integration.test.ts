import { describe, expect, it } from "vitest";

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("GF36 co-curriculars and athletics", () => {
  it("tracks consent, physical expiry, fees, versioned eligibility, and canonical calendar events", async () => {
    const [{ db }, schema, { eq }, activities] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
      import("@/modules/activities/gf36-service"),
    ]);

    const suffix = crypto.randomUUID().slice(0, 8);

    const [jurisdiction] = await db.insert(schema.jurisdictions).values({
      code: `gf36-${suffix}`,
      name: "GF36 Test",
    }).returning();

    const [org] = await db.insert(schema.organizations).values({
      type: "christian_school",
      name: `Athletics School ${suffix}`,
      slug: `athletics-school-${suffix}`,
    }).returning();

    const [site] = await db.insert(schema.sites).values({
      organizationId: org.id,
      name: "Florida Campus",
      slug: `fl-${suffix}`,
      timezone: "America/New_York",
    }).returning();

    const [program] = await db.insert(schema.programs).values({
      organizationId: org.id,
      siteId: site.id,
      jurisdictionId: jurisdiction.id,
      type: "full_school",
      status: "active",
      name: "Athletics Program",
      slug: `athletics-${suffix}`,
      gradeRange: { min: "6", max: "12" },
      deliveryModel: { onsite: true },
      hostOrganizationId: org.id,
      academicProviderOrganizationId: org.id,
      creditIssuingOrganizationId: org.id,
    }).returning();

    const people = await db.insert(schema.people).values([
      { legalFirstName: "Avery", legalLastName: `Student-${suffix}` },
      { legalFirstName: "Pat", legalLastName: `Guardian-${suffix}` },
      { legalFirstName: "Coach", legalLastName: `Advisor-${suffix}` },
    ]).returning();

    const studentPerson = people[0]!;
    const guardian = people[1]!;
    const coach = people[2]!;

    const [student] = await db.insert(schema.studentProfiles).values({
      personId: studentPerson.id,
      gradeLevel: "10",
    }).returning();

    const [household] = await db.insert(schema.households).values({
      displayName: `Athletics Family ${suffix}`,
    }).returning();

    await db.insert(schema.householdMemberships).values([
      {
        householdId: household.id,
        personId: guardian.id,
        relationshipLabel: "guardian",
        isPrimaryContact: true,
      },
      {
        householdId: household.id,
        personId: studentPerson.id,
        relationshipLabel: "student",
        isPrimaryContact: false,
      },
    ]);

    await db.insert(schema.guardianRelationships).values({
      guardianPersonId: guardian.id,
      studentPersonId: studentPerson.id,
      relationshipLabel: "parent",
    });

    const [physical] = await db.insert(schema.documents).values({
      subjectType: "student_profile",
      subjectId: student.id,
      category: "athletic_physical",
      fileName: `physical-${suffix}.pdf`,
      storageProvider: "test",
      storageKey: `physical-${suffix}`,
      mimeType: "application/pdf",
      sensitivityTier: "medical",
      expiresAt: new Date("2028-08-01T00:00:00.000Z"),
      uploadedByPersonId: guardian.id,
    }).returning();

    const staffContext = {
      actorPersonId: coach.id,
      capabilities: new Set([
        "activity.manage",
        "activity.eligibility.evaluate",
        "activity.calendar.manage",
      ]),
      scope: {
        siteIds: [site.id],
        programIds: [program.id],
      },
      requestId: `gf36-staff-${suffix}`,
    };

    const activityId = await activities.createActivity(staffContext, {
      siteId: site.id,
      programId: program.id,
      type: "athletics",
      name: "Track & Field",
      advisorPersonId: coach.id,
    });

    const seasonId = await activities.createActivitySeason(staffContext, {
      activityId,
      name: "Spring 2028",
      startsOn: "2028-01-15",
      endsOn: "2028-05-20",
      feeAmountCents: 15000,
    });

    const guardianContext = {
      actorPersonId: guardian.id,
      capabilities: new Set(["activity.register"]),
      scope: {},
      requestId: `gf36-guardian-${suffix}`,
    };

    const registrationId = await activities.registerForActivity(guardianContext, {
      activitySeasonId: seasonId,
      studentProfileId: student.id,
      householdId: household.id,
      consentVersion: "2028.1",
      physicalDocumentId: physical.id,
      physicalExpiresOn: "2028-08-01",
    });

    const [registration] = await db.select().from(schema.activityRegistrations)
      .where(eq(schema.activityRegistrations.id, registrationId));

    expect(registration.consentRecordId).toBeTruthy();
    expect(registration.physicalDocumentId).toBe(physical.id);
    expect(registration.physicalExpiresOn).toBe("2028-08-01");
    expect(registration.financialObligationId).toBeTruthy();

    const [fee] = await db.select().from(schema.financialObligations)
      .where(eq(schema.financialObligations.id, registration.financialObligationId!));
    expect(fee.amountCents).toBe(15000);

    const check1 = await activities.evaluateActivityEligibility(staffContext, {
      registrationId,
      status: "eligible",
      ruleVersion: "FL-ATH-2028.1",
      evidence: {
        termGpa: 3.1,
        passingCourseCount: 6,
        physicalValidThrough: "2028-08-01",
      },
      validThrough: new Date("2028-03-15T00:00:00.000Z"),
    });

    expect(check1).toBeTruthy();

    const check2 = await activities.evaluateActivityEligibility(staffContext, {
      registrationId,
      status: "conditional",
      ruleVersion: "FL-ATH-2028.2",
      evidence: {
        termGpa: 2.2,
        interventionRequired: true,
      },
      validThrough: new Date("2028-04-15T00:00:00.000Z"),
    });

    expect(check2).not.toBe(check1);

    const checks = await db.select().from(schema.activityEligibilityChecks)
      .where(eq(schema.activityEligibilityChecks.activityRegistrationId, registrationId));
    expect(checks).toHaveLength(2);

    const eventId = await activities.addActivityCalendarEvent(staffContext, {
      activitySeasonId: seasonId,
      title: "Track Practice",
      type: "practice",
      startsAt: new Date("2028-02-01T20:00:00.000Z"),
      endsAt: new Date("2028-02-01T22:00:00.000Z"),
    });

    const [event] = await db.select().from(schema.calendarEvents)
      .where(eq(schema.calendarEvents.id, eventId));
    expect(event.siteId).toBe(site.id);
    expect(event.timezone).toBe("America/New_York");
    expect(event.sourceType).toBe("activity_season");
  });
});

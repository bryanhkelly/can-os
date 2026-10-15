import { describe, expect, it } from "vitest";

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("GF2 new family enrollment", () => {
  it("creates one household/student/application on retry and activates only after acceptance + readiness", async () => {
    const [{ db }, schema, { and, eq }, enrollment] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
      import("@/modules/enrollment/gf2-service"),
    ]);

    const suffix = crypto.randomUUID().slice(0, 8);

    const [jurisdiction] = await db
      .insert(schema.jurisdictions)
      .values({
        code: `gf2-${suffix}`,
        name: "GF2 Test Jurisdiction",
      })
      .returning();

    const [canOrg] = await db
      .insert(schema.organizations)
      .values({
        type: "can_network",
        name: `CAN GF2 ${suffix}`,
        slug: `can-gf2-${suffix}`,
      })
      .returning();

    const [hostOrg] = await db
      .insert(schema.organizations)
      .values({
        type: "church",
        name: `Host Church ${suffix}`,
        slug: `host-church-${suffix}`,
      })
      .returning();

    const [site] = await db
      .insert(schema.sites)
      .values({
        organizationId: hostOrg.id,
        name: "Learning Center",
        slug: `learning-center-${suffix}`,
      })
      .returning();

    const [program] = await db
      .insert(schema.programs)
      .values({
        organizationId: hostOrg.id,
        siteId: site.id,
        jurisdictionId: jurisdiction.id,
        type: "church_hosted_academy",
        status: "active",
        name: "CAN Academy",
        slug: `academy-${suffix}`,
        gradeRange: { min: "6", max: "12" },
        deliveryModel: {
          onsite: true,
          asynchronous: true,
          liveOnline: true,
          onsiteDaysPerWeek: 5,
        },
        hostOrganizationId: hostOrg.id,
        academicProviderOrganizationId: canOrg.id,
        creditIssuingOrganizationId: canOrg.id,
      })
      .returning();

    await db.insert(schema.journeyDefinitions).values({
      key: "family-enrollment",
      version: `test-${suffix}`,
      owningOrganizationId: canOrg.id,
      audience: "family",
      title: "Family Enrollment",
      configuration: {
        requirements: [
          {
            key: "family-profile",
            title: "Confirm family information",
            blocking: true,
            owner: "family",
          },
          {
            key: "program-review",
            title: "CAN reviews enrollment",
            blocking: true,
            owner: "can",
          },
        ],
      },
    });

    const [guardian] = await db
      .insert(schema.people)
      .values({
        legalFirstName: "Jordan",
        legalLastName: `Guardian-${suffix}`,
        email: `guardian-gf2-${suffix}@example.com`,
      })
      .returning();

    const guardianContext = {
      actorPersonId: guardian.id,
      capabilities: new Set([
        "enrollment.apply",
        "journey.requirement.complete",
      ]),
      scope: { programIds: [program.id] },
      requestId: `gf2-family-${suffix}`,
    };

    const idempotencyKey = `family-enrollment-${suffix}`;

    const first = await enrollment.startFamilyApplication(guardianContext, {
      programId: program.id,
      idempotencyKey,
      householdDisplayName: `Morgan Family ${suffix}`,
      student: {
        legalFirstName: "Morgan",
        legalLastName: `Student-${suffix}`,
        preferredName: "Morgan",
        gradeLevel: "9",
      },
    });

    const retry = await enrollment.startFamilyApplication(guardianContext, {
      programId: program.id,
      idempotencyKey,
      householdDisplayName: `Morgan Family ${suffix}`,
      student: {
        legalFirstName: "Morgan",
        legalLastName: `Student-${suffix}`,
        preferredName: "Morgan",
        gradeLevel: "9",
      },
    });

    expect(retry).toEqual(first);

    const matchingApplications = await db
      .select()
      .from(schema.applications)
      .where(eq(schema.applications.idempotencyKey, idempotencyKey));

    expect(matchingApplications).toHaveLength(1);

    const [applicationBefore] = matchingApplications;
    expect(applicationBefore.stage).toBe("application");

    const admissionContext = {
      actorPersonId: guardian.id,
      capabilities: new Set([
        "enrollment.decide",
        "journey.requirement.complete",
        "enrollment.activate",
      ]),
      scope: { programIds: [program.id] },
      requestId: `gf2-admin-${suffix}`,
    };

    await expect(
      enrollment.activateEnrollmentFromApplication(
        admissionContext,
        first.applicationId,
        "2027-2028",
      ),
    ).rejects.toThrow("accepted");

    await enrollment.acceptApplication(
      admissionContext,
      first.applicationId,
      "Accepted for Fall 2027",
    );

    await expect(
      enrollment.activateEnrollmentFromApplication(
        admissionContext,
        first.applicationId,
        "2027-2028",
      ),
    ).rejects.toThrow("ready");

    const requirements = await db
      .select()
      .from(schema.journeyRequirements)
      .where(eq(schema.journeyRequirements.journeyId, first.journeyId));

    expect(requirements).toHaveLength(2);

    const familyRequirement = requirements.find(
      (requirement) => requirement.key === "family-profile",
    )!;
    const canRequirement = requirements.find(
      (requirement) => requirement.key === "program-review",
    )!;

    const firstReadiness = await enrollment.completeJourneyRequirement(
      guardianContext,
      familyRequirement.id,
      [{ fact: "family_confirmed" }],
    );

    expect(firstReadiness).toBe("in_progress");

    const finalReadiness = await enrollment.completeJourneyRequirement(
      admissionContext,
      canRequirement.id,
      [{ fact: "admissions_review_complete" }],
    );

    expect(finalReadiness).toBe("ready");

    const enrollmentId = await enrollment.activateEnrollmentFromApplication(
      admissionContext,
      first.applicationId,
      "2027-2028",
    );

    const retryEnrollmentId =
      await enrollment.activateEnrollmentFromApplication(
        admissionContext,
        first.applicationId,
        "2027-2028",
      );

    expect(retryEnrollmentId).toBe(enrollmentId);

    const [activeEnrollment] = await db
      .select()
      .from(schema.enrollments)
      .where(eq(schema.enrollments.id, enrollmentId));

    expect(activeEnrollment.status).toBe("active");
    expect(activeEnrollment.kind).toBe("program");
    expect(activeEnrollment.programId).toBe(program.id);

    const [journey] = await db
      .select()
      .from(schema.journeys)
      .where(eq(schema.journeys.id, first.journeyId));

    expect(journey.status).toBe("active");

    const activationEvents = await db
      .select()
      .from(schema.domainEvents)
      .where(
        and(
          eq(schema.domainEvents.eventType, "EnrollmentActivated"),
          eq(schema.domainEvents.aggregateId, enrollmentId),
        ),
      );

    expect(activationEvents).toHaveLength(1);
  });
});

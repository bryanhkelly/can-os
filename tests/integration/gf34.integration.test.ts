import { describe, expect, it } from "vitest";

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("GF34 health office", () => {
  it("tracks compliance, medication administration, send-home, clearance, and medical read audit", async () => {
    const [{ db }, schema, { and, eq }, health] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
      import("@/modules/health/gf34-service"),
    ]);

    const suffix = crypto.randomUUID().slice(0, 8);

    const [org] = await db.insert(schema.organizations).values({
      type: "christian_school",
      name: `Health School ${suffix}`,
      slug: `health-school-${suffix}`,
    }).returning();

    const [site] = await db.insert(schema.sites).values({
      organizationId: org.id,
      name: "Main Campus",
      slug: `main-${suffix}`,
    }).returning();

    const people = await db.insert(schema.people).values([
      { legalFirstName: "Taylor", legalLastName: `Student-${suffix}` },
      { legalFirstName: "Pat", legalLastName: `Guardian-${suffix}` },
      { legalFirstName: "Nora", legalLastName: `Nurse-${suffix}` },
    ]).returning();

    const studentPerson = people[0]!;
    const guardian = people[1]!;
    const nurse = people[2]!;

    const [student] = await db.insert(schema.studentProfiles).values({
      personId: studentPerson.id,
      gradeLevel: "9",
    }).returning();

    await db.insert(schema.guardianRelationships).values({
      guardianPersonId: guardian.id,
      studentPersonId: studentPerson.id,
      relationshipLabel: "parent",
    });

    const context = {
      actorPersonId: nurse.id,
      capabilities: new Set([
        "health.manage",
        "health.compliance.manage",
        "medication.authorization.manage",
        "medication.administer",
        "health.visit.manage",
        "health.clearance.manage",
        "health.read",
      ]),
      scope: { siteIds: [site.id] },
      requestId: `gf34-${suffix}`,
    };

    const healthProfileId = await health.ensureHealthProfile(context, student.id);
    expect(healthProfileId).toBeTruthy();

    const complianceId = await health.setHealthCompliance(context, {
      studentProfileId: student.id,
      type: "immunization",
      status: "compliant",
      expiresOn: "2028-08-01",
      notes: "Reviewed.",
    });

    const [compliance] = await db.select().from(schema.healthComplianceItems)
      .where(eq(schema.healthComplianceItems.id, complianceId));
    expect(compliance.status).toBe("compliant");
    expect(compliance.reviewedByPersonId).toBe(nurse.id);

    const authorizationId = await health.createMedicationAuthorization(context, {
      studentProfileId: student.id,
      medicationName: "Rescue Medication",
      instructions: "Administer per approved plan.",
      startsOn: "2027-08-01",
      expiresOn: "2028-06-01",
      emergencyOnly: true,
    });

    const administrationId = await health.administerMedication(context, {
      authorizationId,
      siteId: site.id,
      dose: "1 dose",
      administeredAt: new Date("2027-09-14T18:00:00.000Z"),
    });

    const [administration] = await db.select().from(schema.medicationAdministrations)
      .where(eq(schema.medicationAdministrations.id, administrationId));
    expect(administration.result).toBe("administered");
    expect(administration.administeredByPersonId).toBe(nurse.id);

    const visit = await health.recordHealthOfficeVisit(context, {
      studentProfileId: student.id,
      siteId: site.id,
      reason: "Fever",
      disposition: "sent_home",
      sentHome: true,
      requireReturnClearance: true,
    });

    expect(visit.returnClearanceId).toBeTruthy();

    const guardianNotices = await db.select().from(schema.notifications)
      .where(eq(schema.notifications.recipientPersonId, guardian.id));
    expect(guardianNotices.some((n) => n.type === "student_sent_home_ill")).toBe(true);

    await health.clearReturnToSchool(context, {
      clearanceId: visit.returnClearanceId!,
      notes: "Cleared by health office.",
    });

    const [clearance] = await db.select().from(schema.returnToSchoolClearances)
      .where(eq(schema.returnToSchoolClearances.id, visit.returnClearanceId!));
    expect(clearance.status).toBe("cleared");
    expect(clearance.clearedByPersonId).toBe(nurse.id);

    const readsBefore = await db.select().from(schema.auditEvents).where(
      and(
        eq(schema.auditEvents.action, "health.read"),
        eq(schema.auditEvents.resourceId, student.id),
      ),
    );

    const healthCase = await health.getHealthCase(context, student.id);
    expect(healthCase.compliance).toHaveLength(1);
    expect(healthCase.authorizations).toHaveLength(1);
    expect(healthCase.visits).toHaveLength(1);
    expect(healthCase.clearances).toHaveLength(1);

    const readsAfter = await db.select().from(schema.auditEvents).where(
      and(
        eq(schema.auditEvents.action, "health.read"),
        eq(schema.auditEvents.resourceId, student.id),
      ),
    );
    expect(readsAfter.length).toBe(readsBefore.length + 1);
  });
});

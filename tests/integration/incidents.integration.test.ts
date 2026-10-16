import { describe, expect, it } from "vitest";

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("GF35 safety incident lifecycle", () => {
  it("preserves legal history, requires review, records notifications, and audits sensitive reads", async () => {
    const [{ db }, schema, { and, eq }, incidentModule] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
      import("@/modules/incidents/incident-service"),
    ]);

    const suffix = crypto.randomUUID().slice(0, 8);

    const [jurisdiction] = await db
      .insert(schema.jurisdictions)
      .values({
        code: `gf35-${suffix}`,
        name: "GF35 Test Jurisdiction",
      })
      .returning();

    const [hostOrg] = await db
      .insert(schema.organizations)
      .values({
        type: "christian_school",
        name: `GF35 School ${suffix}`,
        slug: `gf35-school-${suffix}`,
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
        type: "full_school",
        status: "active",
        name: "GF35 Program",
        slug: `gf35-program-${suffix}`,
        gradeRange: { min: "6", max: "12" },
        deliveryModel: { onsite: true },
        hostOrganizationId: hostOrg.id,
        academicProviderOrganizationId: hostOrg.id,
        creditIssuingOrganizationId: hostOrg.id,
      })
      .returning();

    const people = await db
      .insert(schema.people)
      .values([
        { legalFirstName: "Robin", legalLastName: `Reporter-${suffix}` },
        { legalFirstName: "Casey", legalLastName: `Student-${suffix}` },
        { legalFirstName: "Morgan", legalLastName: `Reviewer-${suffix}` },
        { legalFirstName: "Jordan", legalLastName: `Guardian-${suffix}` },
      ])
      .returning();

    const reporter = people[0]!;
    const studentPerson = people[1]!;
    const reviewer = people[2]!;
    const guardian = people[3]!;

    const context = {
      actorPersonId: reporter.id,
      capabilities: new Set([
        "incident.file",
        "incident.amend",
        "incident.review.assign",
        "incident.notify",
        "incident.close",
        "incident.read",
      ]),
      scope: {
        siteIds: [site.id],
        programIds: [program.id],
      },
      requestId: `gf35-${suffix}`,
    };

    const incidentId = await incidentModule.fileIncident(context, {
      incidentNumber: `INC-${suffix}`,
      type: "student_injury",
      severity: "moderate",
      occurredAt: new Date("2027-09-14T18:30:00.000Z"),
      siteId: site.id,
      programId: program.id,
      locationText: "Gym",
      summary: "Student slipped during supervised activity.",
      immediateActions: "First aid provided; guardian contacted.",
      people: [
        {
          personId: studentPerson.id,
          role: "subject",
        },
      ],
    });

    await incidentModule.amendIncident(context, {
      incidentId,
      field: "locationText",
      value: "Gym - east court",
      reason: "Reporter clarified exact location.",
    });

    const reviewId = await incidentModule.assignIncidentReview(context, {
      incidentId,
      reviewerPersonId: reviewer.id,
      level: "site",
    });

    await expect(
      incidentModule.closeIncident(context, {
        incidentId,
        closureNote: "Attempted closure before review.",
      }),
    ).rejects.toThrow("reviews must be complete");

    const reviewerContext = {
      actorPersonId: reviewer.id,
      capabilities: new Set([
        "incident.review.complete",
        "incident.read",
      ]),
      scope: {
        siteIds: [site.id],
        programIds: [program.id],
      },
      requestId: `gf35-review-${suffix}`,
    };

    await incidentModule.completeIncidentReview(reviewerContext, {
      reviewId,
      decision: "close_after_follow_up",
      notes: "Immediate response and guardian communication documented.",
    });

    const guardianNoticeId = await incidentModule.queueIncidentNotification(
      context,
      {
        incidentId,
        recipientPersonId: guardian.id,
        recipientType: "guardian",
        channel: "formal_notice",
        purpose: "guardian_incident_notice",
      },
    );

    expect(guardianNoticeId).toBeTruthy();

    const beforeReadAudits = await db
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.resourceType, "incident"),
          eq(schema.auditEvents.resourceId, incidentId),
          eq(schema.auditEvents.action, "incident.read"),
        ),
      );

    const incidentCase = await incidentModule.getIncidentCase(
      reviewerContext,
      incidentId,
    );

    expect(incidentCase.incident.locationText).toBe("Gym - east court");
    expect(incidentCase.amendments).toHaveLength(1);
    expect(incidentCase.reviews[0]!.status).toBe("complete");
    expect(incidentCase.notifications).toHaveLength(1);

    const afterReadAudits = await db
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.resourceType, "incident"),
          eq(schema.auditEvents.resourceId, incidentId),
          eq(schema.auditEvents.action, "incident.read"),
        ),
      );

    expect(afterReadAudits.length).toBe(beforeReadAudits.length + 1);

    await incidentModule.closeIncident(context, {
      incidentId,
      closureNote: "Review completed and required communication recorded.",
    });

    const [closed] = await db
      .select()
      .from(schema.incidents)
      .where(eq(schema.incidents.id, incidentId));

    expect(closed.status).toBe("closed");

    const amendments = await db
      .select()
      .from(schema.incidentAmendments)
      .where(eq(schema.incidentAmendments.incidentId, incidentId));

    expect(amendments).toHaveLength(1);
    expect(amendments[0]!.field).toBe("locationText");
    expect(amendments[0]!.reason).toContain("clarified");
  });
});

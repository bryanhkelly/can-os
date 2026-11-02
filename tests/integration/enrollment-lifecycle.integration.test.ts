import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  admissionOffers,
  admissionSeatPools,
  applications,
  auditEvents,
  domainEvents,
  enrollments,
  guardianRelationships,
  householdMemberships,
  households,
  journeyDefinitions,
  journeyRequirements,
  journeys,
  notifications,
  organizations,
  people,
  jurisdictions,
  programs,
  sites,
  schoolYears,
  studentProfiles,
} from "@/db/schema";
import {
  activateOfferedEnrollmentCommand,
  issueAdmissionOfferCommand,
  respondToAdmissionOfferCommand,
} from "@/modules/enrollment/admissions-offer-service";
import type { CommandContext } from "@/domain/command-context";
import { createAcademicTimeFixture } from "./helpers/academic-time";

/**
 * GF2 acceptance harness: self-contained fixtures (no seeded demo data), one
 * synthetic household with two children across registrar, guardian, and student
 * roles, plus a second household for the single-seat concurrency scenario.
 * Implements docs/gf2-transaction-acceptance.md scenarios 1-8.
 *
 * Run only via `npm run test:integration` against a disposable Neon branch.
 */

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("GF2 enrollment lifecycle (self-contained fixtures)", () => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const expires = () => new Date(Date.now() + 14 * 86400000);

  let program: { id: string };
  let hostOrg: { id: string };
  let year1: { id: string };
  let year2: { id: string };
  let registrar: { id: string };
  let guardian1: { id: string };
  let unrelatedGuardian: { id: string };
  let student1: { id: string; personId: string };
  let appA: { id: string };
  let appB: { id: string };
  let appNonSynthetic: { id: string };
  let appC: { id: string };
  let appD: { id: string };
  let journeyB: { id: string };
  let blockingReqB: { id: string };

  const ctx = (actorPersonId: string, capability: string, role: "registrar" | "guardian"): CommandContext & { role: string } => ({
    actorPersonId,
    role,
    capabilities: new Set([capability]),
    scope: { programIds: [program.id] },
    requestId: `gf2-${suffix}`,
  });
  const registrarCtx = () => ctx(registrar.id, "enrollment.decide", "registrar");
  const activateCtx = () => ctx(registrar.id, "enrollment.activate", "registrar");
  const guardianCtx = (personId: string) => ctx(personId, "enrollment.apply", "guardian");

  async function createSyntheticApplication(input: {
    householdId: string;
    studentProfileId: string;
    submittedByPersonId: string;
    key: string;
    synthetic: boolean;
    blockingComplete: boolean;
  }) {
    const [app] = await db
      .insert(applications)
      .values({
        householdId: input.householdId,
        studentProfileId: input.studentProfileId,
        programId: program.id,
        stage: "application",
        idempotencyKey: input.key,
        submittedByPersonId: input.submittedByPersonId,
        submittedAt: new Date(),
        metadata: input.synthetic ? { synthetic: true, fixture: "gf2" } : {},
      })
      .returning();

    const [journey] = await db
      .insert(journeys)
      .values({
        type: "enrollment",
        // A journey with incomplete blocking requirements is never persisted
        // as "ready": enrollment-neon-consistency enforces that invariant.
        status: input.blockingComplete ? "ready" : "in_progress",
        participantType: "application",
        participantId: app!.id,
        organizationId: hostOrg.id,
        programId: program.id,
        journeyDefinitionId: journeyDefId,
        definitionVersion: "1",
      })
      .returning();

    const [requirement] = await db
      .insert(journeyRequirements)
      .values({
        journeyId: journey!.id,
        key: `enrollment-form-${input.key}`,
        title: "Enrollment form",
        status: input.blockingComplete ? "complete" : "needs_you",
        blocking: true,
      })
      .returning();

    return { app: app!, journey: journey!, requirement: requirement! };
  }

  let journeyDefId: string;

  beforeAll(async () => {
    const [jurisdiction] = await db
      .insert(jurisdictions)
      .values({ code: `gf2-${suffix}`, name: "GF2 Test Jurisdiction" })
      .returning();

    const [canOrg] = await db
      .insert(organizations)
      .values({
        type: "can_network",
        name: `CAN GF2 ${suffix}`,
        slug: `can-gf2-${suffix}`,
      })
      .returning();

    [hostOrg] = await db
      .insert(organizations)
      .values({
        type: "christian_school",
        name: `GF2 Host ${suffix}`,
        slug: `gf2-host-${suffix}`,
      })
      .returning();

    const [site] = await db
      .insert(sites)
      .values({
        organizationId: hostOrg!.id,
        name: "Main Campus",
        slug: `main-${suffix}`,
      })
      .returning();

    [program] = await db
      .insert(programs)
      .values({
        organizationId: hostOrg!.id,
        siteId: site!.id,
        jurisdictionId: jurisdiction!.id,
        type: "high_school_extension",
        status: "active",
        name: "GF2 High School",
        slug: `gf2-hs-${suffix}`,
        gradeRange: { min: "9", max: "12" },
        deliveryModel: { onsite: true, asynchronous: true, liveOnline: true },
        hostOrganizationId: hostOrg!.id,
        academicProviderOrganizationId: canOrg!.id,
        creditIssuingOrganizationId: canOrg!.id,
      })
      .returning();

    const academicTime = await createAcademicTimeFixture({
      organizationId: hostOrg!.id,
      programId: program.id,
      siteId: site!.id,
      suffix,
    });
    year1 = academicTime.schoolYear;

    [year2] = await db
      .insert(schoolYears)
      .values({
        organizationId: hostOrg!.id,
        programId: program.id,
        siteId: site!.id,
        key: `2028-2029-${suffix}`,
        name: "2028–2029",
        status: "active",
        startsOn: "2028-08-14",
        endsOn: "2029-06-01",
        gradeScaleId: academicTime.gradeScale.id,
        timezone: "America/Los_Angeles",
      })
      .returning();

    await db.insert(admissionSeatPools).values([
      { programId: program.id, schoolYearId: year1.id, capacity: 5 },
      { programId: program.id, schoolYearId: year2!.id, capacity: 1 },
    ]);

    const [journeyDef] = await db
      .insert(journeyDefinitions)
      .values({
        key: `enrollment-${suffix}`,
        version: "1",
        owningOrganizationId: canOrg!.id,
        audience: "guardian",
        title: "Enrollment Journey",
      })
      .returning();
    journeyDefId = journeyDef!.id;

    const peopleRows = await db
      .insert(people)
      .values([
        { legalFirstName: "Riley", legalLastName: `Registrar-${suffix}` },
        { legalFirstName: "Gale", legalLastName: `GuardianOne-${suffix}` },
        { legalFirstName: "Uma", legalLastName: `Unrelated-${suffix}` },
        { legalFirstName: "Gwen", legalLastName: `GuardianTwo-${suffix}` },
        { legalFirstName: "Ari", legalLastName: `ChildA-${suffix}` },
        { legalFirstName: "Blair", legalLastName: `ChildB-${suffix}` },
        { legalFirstName: "Casey", legalLastName: `ChildC-${suffix}` },
        { legalFirstName: "Devon", legalLastName: `ChildD-${suffix}` },
      ])
      .returning();

    registrar = peopleRows[0]!;
    guardian1 = peopleRows[1]!;
    unrelatedGuardian = peopleRows[2]!;
    const guardian2 = peopleRows[3]!;
    const [childA, childB, childC, childD] = [
      peopleRows[4]!,
      peopleRows[5]!,
      peopleRows[6]!,
      peopleRows[7]!,
    ];

    const [household1] = await db
      .insert(households)
      .values({ displayName: `GF2 Household One ${suffix}` })
      .returning();
    const [household2] = await db
      .insert(households)
      .values({ displayName: `GF2 Household Two ${suffix}` })
      .returning();

    await db.insert(householdMemberships).values([
      { householdId: household1!.id, personId: guardian1.id, relationshipLabel: "parent", isPrimaryContact: true },
      { householdId: household1!.id, personId: childA.id, relationshipLabel: "child" },
      { householdId: household1!.id, personId: childB.id, relationshipLabel: "child" },
      { householdId: household2!.id, personId: guardian2.id, relationshipLabel: "parent", isPrimaryContact: true },
      { householdId: household2!.id, personId: childC.id, relationshipLabel: "child" },
      { householdId: household2!.id, personId: childD.id, relationshipLabel: "child" },
    ]);

    const profiles = await db
      .insert(studentProfiles)
      .values([
        { personId: childA.id, gradeLevel: "9" },
        { personId: childB.id, gradeLevel: "10" },
        { personId: childC.id, gradeLevel: "9" },
        { personId: childD.id, gradeLevel: "11" },
      ])
      .returning();
    const [profileA, profileB, profileC, profileD] = profiles as [
      (typeof profiles)[number],
      (typeof profiles)[number],
      (typeof profiles)[number],
      (typeof profiles)[number],
    ];
    student1 = { id: profileA.id, personId: childA.id };

    await db.insert(guardianRelationships).values([
      { guardianPersonId: guardian1.id, studentPersonId: childA.id, relationshipLabel: "parent" },
      { guardianPersonId: guardian1.id, studentPersonId: childB.id, relationshipLabel: "parent" },
      { guardianPersonId: guardian2.id, studentPersonId: childC.id, relationshipLabel: "parent" },
      { guardianPersonId: guardian2.id, studentPersonId: childD.id, relationshipLabel: "parent" },
    ]);

    const a = await createSyntheticApplication({
      householdId: household1!.id,
      studentProfileId: profileA.id,
      submittedByPersonId: guardian1.id,
      key: `gf2-app-a-${suffix}`,
      synthetic: true,
      blockingComplete: true,
    });
    appA = a.app;

    const b = await createSyntheticApplication({
      householdId: household1!.id,
      studentProfileId: profileB.id,
      submittedByPersonId: guardian1.id,
      key: `gf2-app-b-${suffix}`,
      synthetic: true,
      blockingComplete: false,
    });
    appB = b.app;
    journeyB = b.journey;
    blockingReqB = b.requirement;

    appNonSynthetic = (
      await createSyntheticApplication({
        householdId: household1!.id,
        studentProfileId: profileB.id,
        submittedByPersonId: guardian1.id,
        key: `gf2-app-ns-${suffix}`,
        synthetic: false,
        blockingComplete: true,
      })
    ).app;

    appC = (
      await createSyntheticApplication({
        householdId: household2!.id,
        studentProfileId: profileC.id,
        submittedByPersonId: guardian2.id,
        key: `gf2-app-c-${suffix}`,
        synthetic: true,
        blockingComplete: true,
      })
    ).app;

    appD = (
      await createSyntheticApplication({
        householdId: household2!.id,
        studentProfileId: profileD.id,
        submittedByPersonId: guardian2.id,
        key: `gf2-app-d-${suffix}`,
        synthetic: true,
        blockingComplete: true,
      })
    ).app;
  }, 120000);

  it("scenario 1: issues an offer and reissue with the same key returns the same offer", async () => {
    const input = {
      applicationId: appA.id,
      schoolYearId: year1.id,
      idempotencyKey: `gf2-offer-a-${suffix}`,
      expiresAt: expires(),
    };

    const offerId = await issueAdmissionOfferCommand(registrarCtx(), input);
    const reissued = await issueAdmissionOfferCommand(registrarCtx(), {
      ...input,
      expiresAt: expires(),
    });

    expect(reissued).toBe(offerId);

    const issuedEvents = await db
      .select()
      .from(domainEvents)
      .where(
        and(
          eq(domainEvents.eventType, "AdmissionOfferIssued"),
          eq(domainEvents.aggregateId, offerId),
        ),
      );
    expect(issuedEvents).toHaveLength(1);

    const guardianNotices = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.type, "admission_offer_issued"),
          eq(notifications.resourceType, "admission_offer"),
          eq(notifications.resourceId, offerId),
        ),
      );
    expect(guardianNotices.map((n) => n.recipientPersonId)).toEqual([
      guardian1.id,
    ]);
  }, 60000);

  it("scenario 6: acceptance by an unrelated guardian is denied without mutation", async () => {
    const [offerA] = await db
      .select()
      .from(admissionOffers)
      .where(eq(admissionOffers.idempotencyKey, `gf2-offer-a-${suffix}`));

    await expect(
      respondToAdmissionOfferCommand(
        guardianCtx(unrelatedGuardian.id),
        offerA!.id,
        "accept",
      ),
    ).rejects.toThrow("Guardian is not authorized for enrollment");

    const [unchanged] = await db
      .select()
      .from(admissionOffers)
      .where(eq(admissionOffers.id, offerA!.id));
    expect(unchanged!.status).toBe("issued");
    expect(unchanged!.respondedAt).toBeNull();
  }, 60000);

  it("scenario 7a: activation before guardian acceptance creates no enrollment", async () => {
    const [offerA] = await db
      .select()
      .from(admissionOffers)
      .where(eq(admissionOffers.idempotencyKey, `gf2-offer-a-${suffix}`));

    await expect(
      activateOfferedEnrollmentCommand(activateCtx(), offerA!.id),
    ).rejects.toThrow("Guardian must accept offer first");

    const rows = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.studentProfileId, student1.id));
    expect(rows).toHaveLength(0);
  }, 60000);

  it("scenario 2: guardian acceptance is idempotent with exactly one decision and one event", async () => {
    const [offerA] = await db
      .select()
      .from(admissionOffers)
      .where(eq(admissionOffers.idempotencyKey, `gf2-offer-a-${suffix}`));

    await respondToAdmissionOfferCommand(guardianCtx(guardian1.id), offerA!.id, "accept");
    await respondToAdmissionOfferCommand(guardianCtx(guardian1.id), offerA!.id, "accept");

    const [offer] = await db
      .select()
      .from(admissionOffers)
      .where(eq(admissionOffers.id, offerA!.id));
    expect(offer!.status).toBe("accepted");
    expect(offer!.respondedByPersonId).toBe(guardian1.id);

    const acceptedEvents = await db
      .select()
      .from(domainEvents)
      .where(
        and(
          eq(domainEvents.eventType, "AdmissionOfferAccepted"),
          eq(domainEvents.aggregateId, offerA!.id),
        ),
      );
    expect(acceptedEvents).toHaveLength(1);

    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, appA.id));
    expect(app!.stage).toBe("accepted");
  }, 60000);

  it("scenario 3: activation is idempotent and visible in admissions and household state", async () => {
    const [offerA] = await db
      .select()
      .from(admissionOffers)
      .where(eq(admissionOffers.idempotencyKey, `gf2-offer-a-${suffix}`));

    const enrollmentId = await activateOfferedEnrollmentCommand(activateCtx(), offerA!.id);
    const again = await activateOfferedEnrollmentCommand(activateCtx(), offerA!.id);
    expect(again).toBe(enrollmentId);

    const matches = await db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentProfileId, student1.id),
          eq(enrollments.programId, program.id),
          eq(enrollments.schoolYearId, year1.id),
          eq(enrollments.kind, "program"),
          eq(enrollments.status, "active"),
        ),
      );
    expect(matches).toHaveLength(1);

    const activatedEvents = await db
      .select()
      .from(domainEvents)
      .where(
        and(
          eq(domainEvents.eventType, "EnrollmentActivated"),
          eq(domainEvents.aggregateId, enrollmentId),
        ),
      );
    expect(activatedEvents).toHaveLength(1);

    const activationNotices = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.type, "enrollment_activated"),
          eq(notifications.resourceType, "enrollment"),
          eq(notifications.resourceId, enrollmentId),
        ),
      );
    expect(activationNotices.map((n) => n.recipientPersonId).sort()).toEqual(
      [guardian1.id, student1.personId].sort(),
    );

    const [journey] = await db
      .select()
      .from(journeys)
      .where(
        and(
          eq(journeys.participantType, "application"),
          eq(journeys.participantId, appA.id),
        ),
      );
    expect(journey!.status).toBe("active");
  }, 60000);

  it("scenario 4: capability authorization governs all provenance while the obsolete flag has no effect", async () => {
    process.env.CAN_DEMO_WRITES_ENABLED = "false";
    let authenticOfferId: string;
    try {
      await expect(
        issueAdmissionOfferCommand({...registrarCtx(),capabilities:new Set()}, {
          applicationId: appA.id,
          schoolYearId: year1.id,
          idempotencyKey: `gf2-offer-killswitch-${suffix}`,
          expiresAt: expires(),
        }),
      ).rejects.toThrow("enrollment.decide");

      authenticOfferId = await issueAdmissionOfferCommand(registrarCtx(), {
        applicationId: appNonSynthetic.id,
        schoolYearId: year1.id,
        idempotencyKey: `gf2-offer-ns-${suffix}`,
        expiresAt: expires(),
      });
    } finally {
      delete process.env.CAN_DEMO_WRITES_ENABLED;
    }

    const blocked = await db
      .select()
      .from(admissionOffers)
      .where(eq(admissionOffers.idempotencyKey, `gf2-offer-killswitch-${suffix}`));
    expect(blocked).toHaveLength(0);

    const blockedAudit = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, "admissions.offer.issue"));
    expect(
      blockedAudit.filter((row) => blocked.some((o) => o.id === row.resourceId)),
    ).toHaveLength(0);

    // Leave no held seat behind for the later capacity scenarios.
    await respondToAdmissionOfferCommand(
      guardianCtx(guardian1.id),
      authenticOfferId!,
      "decline",
    );
    const [declined] = await db
      .select()
      .from(admissionOffers)
      .where(eq(admissionOffers.id, authenticOfferId!));
    expect(declined!.status).toBe("declined");
  }, 60000);

  it("scenario 7b/8: incomplete blocking requirements block issuance; a declined offer cannot be resurrected by its key", async () => {
    await expect(
      issueAdmissionOfferCommand(registrarCtx(), {
        applicationId: appB.id,
        schoolYearId: year1.id,
        idempotencyKey: `gf2-offer-b-${suffix}`,
        expiresAt: expires(),
      }),
    ).rejects.toThrow("Enrollment Journey must be ready");

    await db
      .update(journeyRequirements)
      .set({ status: "complete", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(journeyRequirements.id, blockingReqB.id));
    await db
      .update(journeys)
      .set({ status: "ready", updatedAt: new Date() })
      .where(eq(journeys.id, journeyB.id));

    const offerB = await issueAdmissionOfferCommand(registrarCtx(), {
      applicationId: appB.id,
      schoolYearId: year1.id,
      idempotencyKey: `gf2-offer-b-${suffix}`,
      expiresAt: expires(),
    });

    await respondToAdmissionOfferCommand(guardianCtx(guardian1.id), offerB, "decline");
    await respondToAdmissionOfferCommand(guardianCtx(guardian1.id), offerB, "decline");

    const [declined] = await db
      .select()
      .from(admissionOffers)
      .where(eq(admissionOffers.id, offerB));
    expect(declined!.status).toBe("declined");

    await expect(
      issueAdmissionOfferCommand(registrarCtx(), {
        applicationId: appB.id,
        schoolYearId: year1.id,
        idempotencyKey: `gf2-offer-b-${suffix}`,
        expiresAt: expires(),
      }),
    ).rejects.toThrow("Existing offer is no longer actionable");

    const declinedEvents = await db
      .select()
      .from(domainEvents)
      .where(
        and(
          eq(domainEvents.eventType, "AdmissionOfferDeclined"),
          eq(domainEvents.aggregateId, offerB),
        ),
      );
    expect(declinedEvents).toHaveLength(1);
  }, 60000);

  it("scenario 5: two applicants racing for one seat produce exactly one reservation", async () => {
    const results = await Promise.allSettled([
      issueAdmissionOfferCommand(registrarCtx(), {
        applicationId: appC.id,
        schoolYearId: year2.id,
        idempotencyKey: `gf2-offer-c-${suffix}`,
        expiresAt: expires(),
      }),
      issueAdmissionOfferCommand(registrarCtx(), {
        applicationId: appD.id,
        schoolYearId: year2.id,
        idempotencyKey: `gf2-offer-d-${suffix}`,
        expiresAt: expires(),
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason?.message).toMatch(
      /Seat pool is full/,
    );

    const poolOffers = await db
      .select()
      .from(admissionOffers)
      .where(
        and(
          eq(admissionOffers.programId, program.id),
          eq(admissionOffers.schoolYearId, year2.id),
          inArray(admissionOffers.status, ["issued", "accepted"]),
        ),
      );
    expect(poolOffers).toHaveLength(1);

    // A deterministic retry for the loser still fails while the seat is held.
    const loserApp = results[0]!.status === "rejected" ? appC : appD;
    await expect(
      issueAdmissionOfferCommand(registrarCtx(), {
        applicationId: loserApp.id,
        schoolYearId: year2.id,
        idempotencyKey: `gf2-offer-loser-${suffix}`,
        expiresAt: expires(),
      }),
    ).rejects.toThrow("Seat pool is full");
  }, 60000);
});

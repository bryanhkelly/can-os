import { describe, expect, it, vi } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import type { Database } from "@/db/client";
import { enablePublishedPolicyInRollback } from "./helpers/published-policy";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const launchState = vi.hoisted(() => ({ context: null as unknown, tx: undefined as Transaction | undefined }));
vi.mock("@/db/client", () => ({
  get db() { if (!launchState.tx) throw new Error("GF3 tests must stay in their rollback transaction"); return launchState.tx; },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ validator() { return this; }, handler(callback: unknown) { return callback; } }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => new Request("http://localhost") }));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: async () => launchState.context as AccessContext,
}));

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("GF3 host / program launch", () => {
  it("launches a church-hosted academy and K-8 high-school extension through the same path", async () => {
    const { db: database } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-gf3-launch");
    let fixturePersonId = "";
    let checked = false;
    try {
      await database.transaction(async tx => {
        launchState.tx = tx;
        await enablePublishedPolicyInRollback(tx);
    const [{ db }, schema, { eq, and }, programsModule, journeyModule, launchAcademics, launchFunctions] =
      await Promise.all([
        import("@/db/client"),
        import("@/db/schema"),
        import("drizzle-orm"),
        import("@/modules/programs/program-launch-service"),
        import("@/modules/journeys/complete-requirement"),
        import("@/modules/programs/launch-academics.functions"),
        import("@/modules/programs/launch.functions"),
      ]);
    const { createAcademicTimeFixture } = await import("./helpers/academic-time");

    const suffix = crypto.randomUUID().slice(0, 8);

    const [jurisdiction] = await db
      .insert(schema.jurisdictions)
      .values({
        code: `gf3-${suffix}`,
        name: "GF3 Test Jurisdiction",
      })
      .returning();

    const [canOrg] = await db
      .insert(schema.organizations)
      .values({
        type: "can_network",
        name: `CAN GF3 ${suffix}`,
        slug: `can-gf3-${suffix}`,
      })
      .returning();

    await db.insert(schema.journeyDefinitions).values({
      key: "program-launch",
      version: `test-${suffix}`,
      owningOrganizationId: canOrg.id,
      audience: "partner",
      title: "Program Launch",
      configuration: {
        requirements: [
          {
            key: "staffing",
            title: "Staffing ready",
            blocking: true,
            owner: "partner",
          },
          {
            key: "academic-provisioning",
            title: "Academic provisioning complete",
            blocking: true,
            owner: "can",
          },
        ],
      },
    });

    const [operator] = await db
      .insert(schema.people)
      .values({
        legalFirstName: "Alex",
        legalLastName: `Operator-${suffix}`,
        email: `operator-gf3-${suffix}@example.com`,
      })
      .returning();
    fixturePersonId = operator.id;
    const [operatorAccount]=await db.insert(schema.accessAccounts).values({
      emailNormalized:`operator-gf3-${suffix}@example.com`,
    }).returning();

    const contextFor = (hostId: string, siteId: string | null) => ({
      actorPersonId: operator!.id,
      capabilities: new Set([
        "program.launch.start",
        "program.read",
        "journey.requirement.complete",
        "calendar.event.create",
        "program.activate",
        "staffing.policy.publish",
        "action.resolve",
      ]),
      scope: {
        organizationIds: [hostId],
        ...(siteId ? { siteIds: [siteId] } : {}),
        programIds: [] as string[],
      },
      requestId: `gf3-${suffix}`,
    });

    const [unrelatedAcademicOrganization] = await db.insert(schema.organizations).values({
      type: "christian_school", name: `Unrelated Academic School ${suffix}`,
      slug: `unrelated-academic-${suffix}`,
    }).returning();

    const scenarios = [
      {
        orgType: "church" as const,
        programType: "church_hosted_academy" as const,
        orgName: "Fellowship Church",
        programName: "CAN Academy",
        gradeRange: { min: "6", max: "12" },
      },
      {
        orgType: "christian_school" as const,
        programType: "high_school_extension" as const,
        orgName: "Vineyard Academy",
        programName: "CAN High School Extension",
        gradeRange: { min: "9", max: "12" },
      },
    ];

    for (const [index, scenario] of scenarios.entries()) {
      const [host] = await db
        .insert(schema.organizations)
        .values({
          type: scenario.orgType,
          name: `${scenario.orgName} ${suffix}-${index}`,
          slug: `host-${suffix}-${index}`,
        })
        .returning();

      const [site] = await db
        .insert(schema.sites)
        .values({
          organizationId: host.id,
          name: "Main Campus",
          slug: `main-${suffix}-${index}`,
          timezone: "America/Los_Angeles",
        })
        .returning();

      const context = contextFor(host.id, site.id);
      await db.insert(schema.accountPersonGrants).values({
        accountId:operatorAccount.id,personId:operator.id,role:"registrar",
        organizationId:host.id,siteId:site.id,active:true,
      });
      const launchContext = {
        ...context,
        role: "registrar" as const,
        grantSiteId: site.id,
        scope: { ...context.scope, programIds: [] as string[] },
      };
      launchState.context = launchContext;
      const options = await launchFunctions.listLaunchOptions();
      expect(options.organizations.map(org => org.id)).toContain(host.id);
      expect(options.organizations.map(org => org.id)).not.toContain(canOrg.id);
      expect(options.academicProviderOrganizations.map(org => org.id)).toContain(canOrg.id);
      expect(options.creditIssuingOrganizations.map(org => org.id)).toContain(canOrg.id);
      expect(options.academicProviderOrganizations.map(org => org.id)).not.toContain(unrelatedAcademicOrganization.id);

      if (scenario.programType === "church_hosted_academy") {
        await expect(programsModule.startProgramLaunch(context, {
          hostOrganizationId: host.id, siteId: site.id, jurisdictionId: jurisdiction.id,
          type: scenario.programType, name: "Unauthorized provider",
          slug: `unauthorized-provider-${suffix}`, gradeRange: scenario.gradeRange,
          deliveryModel: { onsite: true, onsiteDaysPerWeek: 5 },
          academicProviderOrganizationId: unrelatedAcademicOrganization.id,
          creditIssuingOrganizationId: unrelatedAcademicOrganization.id,
        })).rejects.toThrow(/must be a CAN network organization/);
      }

      const launch = await programsModule.startProgramLaunch(context, {
        hostOrganizationId: host.id,
        siteId: site.id,
        jurisdictionId: jurisdiction.id,
        type: scenario.programType,
        name: scenario.programName,
        slug: `program-${suffix}-${index}`,
        gradeRange: scenario.gradeRange,
        deliveryModel: {
          onsite: true,
          asynchronous: true,
          liveOnline: true,
          onsiteDaysPerWeek:
            scenario.programType === "high_school_extension" ? 2 : 5,
        },
        academicProviderOrganizationId: canOrg.id,
        creditIssuingOrganizationId: canOrg.id,
      });
      // The service caller and the mocked signed-in registrar must both use
      // explicit, current Program scope; undefined is not a realistic grant.
      context.scope.programIds = [launch.programId];
      launchContext.scope.programIds = [launch.programId];

      const [launchingProgram] = await db
        .select()
        .from(schema.programs)
        .where(eq(schema.programs.id, launch.programId));

      expect(launchingProgram.type).toBe(scenario.programType);
      expect(launchingProgram.status).toBe("launching");
      expect(launchingProgram.hostOrganizationId).toBe(host.id);
      expect(launchingProgram.academicProviderOrganizationId).toBe(canOrg.id);

      if (scenario.programType === "church_hosted_academy") {
        // Authorization scope must be checked before exposing an unrelated
        // organization's institutional agreement/opening decision.
        await expect(
          programsModule.activateProgram({
            ...context, scope: {...context.scope,
              organizationIds: [unrelatedAcademicOrganization.id]},
          }, launch.programId),
        ).rejects.toThrow("verified organization grant");
        // Planning a church-owned campus with a CAN academic provider is
        // allowed; without an independently approved institution/site
        // agreement the Program must NOT be activated, even from draft.
        await expect(
          programsModule.activateProgram(context, launch.programId),
        ).rejects.toThrow("independently verified Program-Site institutional authorization");
      } else {
        await expect(
          programsModule.activateProgram(context, launch.programId),
        ).rejects.toThrow("ready");
      }

      const requirements = await db
        .select()
        .from(schema.journeyRequirements)
        .where(eq(schema.journeyRequirements.journeyId, launch.journeyId));

      for (const requirement of requirements) {
        await journeyModule.completeJourneyRequirement(
          context,
          requirement.id,
          [{ fact: `${requirement.key}_complete` }],
        );
      }

      // Activation also requires an active school year with at least one
      // ready section for the program (Phase 2 launch gating).
      const academicTime = await createAcademicTimeFixture({
        organizationId: host.id,
        programId: launch.programId,
        siteId: site.id,
        suffix: `${suffix}-${index}`,
      });
      const [course] = await db
        .insert(schema.courseTemplates)
        .values({
          owningOrganizationId: host.id,
          code: `LAUNCH-${suffix}-${index}`,
          title: "Launch Readiness Course",
          subject: "General",
        })
        .returning();
      const [version] = await db
        .insert(schema.courseTemplateVersions)
        .values({
          courseTemplateId: course!.id,
          version: 1,
          status: "published",
        })
        .returning();
      const [section] = await db
        .insert(schema.sections)
        .values({
          programId: launch.programId,
          siteId: site.id,
          courseTemplateVersionId: version!.id,
          code: "LAUNCH-1",
          title: "Launch Readiness",
          termId: academicTime.term.id,
        })
        .returning();
      const [launchTeacher] = await db.insert(schema.people).values({
        legalFirstName: "Launch", legalLastName: `Teacher-${suffix}-${index}`,
      }).returning();
      await db.insert(schema.roleAssignments).values({
        personId: launchTeacher.id, organizationId: host.id, siteId: site.id,
        programId: launch.programId, roleKey: "teacher",
      });
      const [qualification] = await db.insert(schema.qualificationDefinitions).values({
        key: `gf3-license-${suffix}-${index}`, kind: "license", title: "Synthetic GF3 teaching qualification",
      }).returning();
      // A verified membership and explicit publisher assignment—not the generic
      // registrar capability—authorizes the institutional staffing policy.
      await db.insert(schema.memberships).values({
        personId: operator.id, organizationId: host.id,
      }).onConflictDoNothing();
      await db.insert(schema.roleAssignments).values({
        personId: operator.id, organizationId: host.id, siteId: site.id,
        programId: launch.programId, roleKey: "staffing_policy_publisher",
        capabilities: ["staffing.policy.publish"],
      });
      await launchAcademics.publishLaunchTeacherPolicy({ data: {
        programId: launch.programId, qualificationKeys: [qualification.key], confirmed: true,
      } });

      // Selecting CAN as a provider must not expose every CAN-wide teacher.
      // Only an explicitly program-delegated CAN teacher is a candidate.
      const [networkWideTeacher,delegatedTeacher] = await db.insert(schema.people).values([
        {legalFirstName:"CAN",legalLastName:"NetworkWide-"+suffix},
        {legalFirstName:"CAN",legalLastName:"Delegated-"+suffix},
      ]).returning();
      await db.insert(schema.roleAssignments).values([
        {personId:networkWideTeacher.id,organizationId:canOrg.id,roleKey:"teacher"},
        {personId:delegatedTeacher.id,organizationId:canOrg.id,
          programId:launch.programId,roleKey:"teacher"},
      ]);
      for (const person of [launchTeacher,networkWideTeacher,delegatedTeacher]) {
        const [account]=await db.insert(schema.accessAccounts).values({
          emailNormalized:"launch-provider-"+person.id+"@example.com",emailVerifiedAt:new Date(),
        }).returning();
        await db.insert(schema.accountPersonGrants).values({
          accountId:account.id,personId:person.id,organizationId:canOrg.id,
          siteId:null,role:"teacher",active:true,});
      }
      const teacherChoices=await launchAcademics.getLaunchAcademicSetup({data:{programId:launch.programId}});
      const visibleTeacherIds=teacherChoices.teachingStaff.map(teacher=>teacher.personId);
      expect(visibleTeacherIds).not.toContain(networkWideTeacher.id);
      expect(visibleTeacherIds).not.toContain(launchTeacher.id);
      expect(visibleTeacherIds).toContain(delegatedTeacher.id);
      const candidateIds=teacherChoices.sections.flatMap(section=>section.candidates.map(candidate=>candidate.personId));
      expect(candidateIds).not.toContain(networkWideTeacher.id);
      expect(candidateIds).toContain(delegatedTeacher.id);

      // A host role must not count as CAN instruction, even with a CAN account.
      await db.update(schema.roleAssignments).set({organizationId:canOrg.id})
        .where(eq(schema.roleAssignments.personId,launchTeacher.id));
      const [claim] = await db.insert(schema.qualificationClaims).values({
        personId: launchTeacher.id, definitionId: qualification.id,
        issuedAt: new Date("2027-01-01"), expiresAt: new Date("2028-01-01"),
      }).returning();
      await db.insert(schema.qualificationVerificationEvents).values({
        claimId: claim.id, sequence: 1, decision: "approve", actorPersonId: operator.id,
      });
      await db.insert(schema.sectionRegistrationPolicies).values({
        sectionId: section!.id,
        enrollmentCapacity: 24,
        addDropEndsOn: "2027-10-01",
        withdrawalEndsOn: "2027-12-01",
      });
      await db.insert(schema.deliveryArrangements).values({
        sectionId: section!.id,
        academicProviderOrganizationId: canOrg.id,
        facilitatorPersonId: operator.id,
        modality: "onsite",
        status: "active",
      });
      const assigned = await launchAcademics.assignLaunchTeacher({ data: {
        programId: launch.programId, sectionId: section!.id, teacherPersonId: launchTeacher.id,
      } });
      expect(assigned.created).toBe(true);
      expect(await launchAcademics.assignLaunchTeacher({ data: {
        programId: launch.programId, sectionId: section!.id, teacherPersonId: launchTeacher.id,
      } })).toMatchObject({ created: false });
      const [teacherArrangement] = await db.select().from(schema.deliveryArrangements)
        .where(and(eq(schema.deliveryArrangements.sectionId, section!.id),
          eq(schema.deliveryArrangements.instructorPersonId, launchTeacher.id),
          eq(schema.deliveryArrangements.status, "active")));
      const teacherAssignmentEvents = await db.select().from(schema.domainEvents).where(and(
        eq(schema.domainEvents.aggregateId, teacherArrangement.id),
        eq(schema.domainEvents.eventType, "DeliveryArrangementActivated"),
      ));
      expect(teacherAssignmentEvents).toHaveLength(1);
      expect(await db.select().from(schema.auditEvents).where(and(
        eq(schema.auditEvents.resourceId, teacherArrangement.id),
        eq(schema.auditEvents.action, "launch.teacher.assign"),
      ))).toHaveLength(1);
      const [teacherAudit] = await db.select().from(schema.auditEvents).where(and(
        eq(schema.auditEvents.resourceId, teacherArrangement.id),
        eq(schema.auditEvents.action, "launch.teacher.assign"),
      ));
      expect(teacherAudit.context.requestId).toBe(context.requestId);

      const orientationId = await programsModule.createProgramOrientation(
        context,
        {
          programId: launch.programId,
          title: `${scenario.programName} Orientation`,
          startsAt: new Date("2027-08-20T17:00:00.000Z"),
          endsAt: new Date("2027-08-20T19:00:00.000Z"),
          timezone: "America/Los_Angeles",
        },
      );

      const orientationRetryId =
        await programsModule.createProgramOrientation(context, {
          programId: launch.programId,
          title: "Duplicate attempt",
          startsAt: new Date("2027-08-21T17:00:00.000Z"),
          timezone: "America/Los_Angeles",
        });

      expect(orientationRetryId).toBe(orientationId);
      expect(await db.select().from(schema.domainEvents).where(and(
        eq(schema.domainEvents.aggregateId, orientationId),
        eq(schema.domainEvents.eventType, "CalendarEventCreated"),
      ))).toHaveLength(1);
      expect(await db.select().from(schema.auditEvents).where(and(
        eq(schema.auditEvents.resourceId, orientationId),
        eq(schema.auditEvents.action, "program.orientation.schedule"),
      ))).toHaveLength(1);

      // A site-scoped membership cannot create another campus, even if its
      // effective site list is empty. The verified grant remains authoritative.
      launchContext.scope.siteIds = [];
      await expect(launchFunctions.createLaunchSite({ data: {
        organizationId: host.id,
        name: "Unauthorized Campus",
        slug: `unauthorized-${suffix}-${index}`,
        timezone: "America/Los_Angeles",
      } })).rejects.toThrow("organization-wide site creation");
      launchContext.scope.siteIds = [site.id];

      // Organization-wide grant with expanded effective site IDs is still
      // organization-wide; this is how production session resolution behaves.
      const [wideGrant] = await db.insert(schema.accountPersonGrants).values({
        accountId: operatorAccount.id, personId: operator.id, role: "registrar",
        organizationId: host.id, siteId: null, active: true,
      }).returning({id:schema.accountPersonGrants.id});
      const wideContext = {
        ...launchContext,
        grantId: wideGrant.id,
        grantSiteId: null,
        scope: { ...launchContext.scope, siteIds: [site.id] },
      };
      launchState.context = wideContext;
      const extraSite = await launchFunctions.createLaunchSite({ data: {
        organizationId: host.id,
        name: "Additional Campus",
        slug: `additional-${suffix}-${index}`,
        timezone: "America/Los_Angeles",
      } });
      // Exercise the actual registrar handler for the expansion's program.
      const extension = await launchFunctions.startLaunch({ data: {
        hostOrganizationId: host.id,
        siteId: extraSite.siteId,
        jurisdictionId: jurisdiction.id,
        type: "high_school_extension",
        name: "Second Campus High School Extension",
        slug: `extension-${suffix}-${index}`,
        gradeRange: { min: "9", max: "12" },
        deliveryModel: { onsite: true, asynchronous: true, onsiteDaysPerWeek: 2 },
        academicProviderOrganizationId: canOrg.id,
        creditIssuingOrganizationId: canOrg.id,
      } });
      const [extensionProgram] = await db.select().from(schema.programs)
        .where(eq(schema.programs.id, extension.programId));
      expect(extensionProgram.siteId).toBe(extraSite.siteId);
      expect(extensionProgram.type).toBe("high_school_extension");
      expect(extensionProgram.status).toBe("launching");
      expect(extension.journeyId).toBeTruthy();
      if (scenario.orgType === "church") {
        // Switching a church-owned CAN site from church_hosted_academy to
        // high_school_extension must not bypass institutional authorization.
        await expect(programsModule.activateProgram({
          ...context, scope: {
            ...context.scope, siteIds: [site.id, extraSite.siteId],
            programIds: [launch.programId, extension.programId],
          },
        }, extension.programId)).rejects.toThrow(
          "independently verified Program-Site institutional authorization",
        );
      }
      launchState.context = launchContext;
      expect(await db.select().from(schema.domainEvents).where(and(
        eq(schema.domainEvents.aggregateId, extraSite.siteId),
        eq(schema.domainEvents.eventType, "SiteCreated"),
      ))).toHaveLength(1);
      const [siteAudit] = await db.select().from(schema.auditEvents).where(and(
        eq(schema.auditEvents.resourceId, extraSite.siteId),
        eq(schema.auditEvents.action, "site.create"),
      ));
      expect(siteAudit.context.requestId).toBe(context.requestId);
      await (await import("@/workers/domain-event-worker")).processPendingDomainEvents();
      const [siteEvent] = await db.select().from(schema.domainEvents).where(and(
        eq(schema.domainEvents.aggregateId, extraSite.siteId),
        eq(schema.domainEvents.eventType, "SiteCreated"),
      ));
      expect(siteEvent.status).toBe("processed");

      const {listOpeningHandoffs,acknowledgeOpeningHandoff}=await import("@/modules/programs/opening-handoff.server");
      if (scenario.programType === "church_hosted_academy") {
        // All local course/staffing and launch checklist work is complete,
        // yet that evidence cannot silently substitute for CAN authorization.
        await expect(
          programsModule.activateProgram(context, launch.programId, {recipientPersonId:operator.id}),
        ).rejects.toThrow("independently verified Program-Site institutional authorization");
        expect(await listOpeningHandoffs([launch.programId])).toHaveLength(0);
        const [blockedProgram] = await db.select().from(schema.programs)
          .where(eq(schema.programs.id, launch.programId));
        expect(blockedProgram.status).toBe("launching");
        expect(await db.select().from(schema.domainEvents).where(and(
          eq(schema.domainEvents.aggregateId, launch.programId),
          eq(schema.domainEvents.eventType, "ProgramActivated"),
        ))).toHaveLength(0);
      } else {
        await programsModule.activateProgram(context, launch.programId,{recipientPersonId:operator.id});
        const handoffs=await listOpeningHandoffs([launch.programId]);
        expect(handoffs).toHaveLength(1);
        expect(handoffs[0]?.ownerPersonId).toBe(operator.id);
        await acknowledgeOpeningHandoff(launchContext,{
          actionId:handoffs[0]!.id,note:"As the opening and receiving operator, I reviewed and received daily operations.",
        });
        expect((await listOpeningHandoffs([launch.programId]))[0]?.status).toBe("resolved");
        const [activeProgram] = await db.select().from(schema.programs)
          .where(eq(schema.programs.id, launch.programId));
        expect(activeProgram.status).toBe("active");
        const [journey] = await db.select().from(schema.journeys)
          .where(eq(schema.journeys.id, launch.journeyId));
        expect(journey.status).toBe("active");
      }

      const orientationRows = await db
        .select()
        .from(schema.calendarEvents)
        .where(eq(schema.calendarEvents.programId, launch.programId));

      expect(orientationRows).toHaveLength(1);
      expect(orientationRows[0]!.sourceType).toBe("program_orientation");
    }
        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      launchState.tx = undefined;
      launchState.context = null;
    }
    expect(checked).toBe(true);
    const { people } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    expect(await database.select().from(people).where(eq(people.id, fixturePersonId))).toEqual([]);
  }, 120_000);
});

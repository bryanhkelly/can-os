import { describe, expect, it } from "vitest";

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("GF3 host / program launch", () => {
  it("launches a church-hosted academy and K-8 high-school extension through the same path", async () => {
    const [{ db }, schema, { eq }, programsModule, journeyModule] =
      await Promise.all([
        import("@/db/client"),
        import("@/db/schema"),
        import("drizzle-orm"),
        import("@/modules/programs/program-launch-service"),
        import("@/modules/journeys/complete-requirement"),
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

    const contextFor = (hostId: string, siteId: string | null) => ({
      actorPersonId: operator!.id,
      capabilities: new Set([
        "program.launch.start",
        "journey.requirement.complete",
        "calendar.event.create",
        "program.activate",
      ]),
      scope: {
        organizationIds: [hostId],
        ...(siteId ? { siteIds: [siteId] } : {}),
      },
      requestId: `gf3-${suffix}`,
    });

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

      const [launchingProgram] = await db
        .select()
        .from(schema.programs)
        .where(eq(schema.programs.id, launch.programId));

      expect(launchingProgram.type).toBe(scenario.programType);
      expect(launchingProgram.status).toBe("launching");
      expect(launchingProgram.hostOrganizationId).toBe(host.id);
      expect(launchingProgram.academicProviderOrganizationId).toBe(canOrg.id);

      await expect(
        programsModule.activateProgram(context, launch.programId),
      ).rejects.toThrow("ready");

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

      await programsModule.activateProgram(context, launch.programId);

      const [activeProgram] = await db
        .select()
        .from(schema.programs)
        .where(eq(schema.programs.id, launch.programId));

      expect(activeProgram.status).toBe("active");

      const [journey] = await db
        .select()
        .from(schema.journeys)
        .where(eq(schema.journeys.id, launch.journeyId));

      expect(journey.status).toBe("active");

      const orientationRows = await db
        .select()
        .from(schema.calendarEvents)
        .where(eq(schema.calendarEvents.programId, launch.programId));

      expect(orientationRows).toHaveLength(1);
      expect(orientationRows[0]!.sourceType).toBe("program_orientation");
    }
  });
});

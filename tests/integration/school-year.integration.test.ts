import { describe, expect, it } from "vitest";

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("GF23 school-year setup", () => {
  it("enforces canonical academic time before activation", async () => {
    const [{ db }, schema, academicTime] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("@/modules/academic-time/school-year-service"),
    ]);

    const suffix = crypto.randomUUID().slice(0, 8);

    const [jurisdiction] = await db
      .insert(schema.jurisdictions)
      .values({
        code: `gf23-${suffix}`,
        name: "GF23 Test Jurisdiction",
      })
      .returning();

    const [canOrg] = await db
      .insert(schema.organizations)
      .values({
        type: "can_network",
        name: `CAN GF23 ${suffix}`,
        slug: `can-gf23-${suffix}`,
      })
      .returning();

    const [hostOrg] = await db
      .insert(schema.organizations)
      .values({
        type: "christian_school",
        name: `GF23 School ${suffix}`,
        slug: `gf23-school-${suffix}`,
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
        name: "CAN High School Extension",
        slug: `hs-${suffix}`,
        gradeRange: { min: "9", max: "12" },
        deliveryModel: {
          onsite: true,
          asynchronous: true,
          liveOnline: true,
          onsiteDaysPerWeek: 2,
        },
        hostOrganizationId: hostOrg.id,
        academicProviderOrganizationId: canOrg.id,
        creditIssuingOrganizationId: canOrg.id,
      })
      .returning();

    const [operator] = await db
      .insert(schema.people)
      .values({
        legalFirstName: "Alex",
        legalLastName: `Academic-${suffix}`,
      })
      .returning();

    const [gradeScale] = await db
      .insert(schema.gradeScales)
      .values({
        owningOrganizationId: hostOrg.id,
        name: "Standard 4.0",
        version: 1,
        configuration: {
          entries: [
            { label: "A", minPercent: 90, maxPercent: 100, gpaPoints: 4, passing: true },
            { label: "B", minPercent: 80, maxPercent: 89.99, gpaPoints: 3, passing: true },
            { label: "C", minPercent: 70, maxPercent: 79.99, gpaPoints: 2, passing: true },
            { label: "D", minPercent: 60, maxPercent: 69.99, gpaPoints: 1, passing: true },
            { label: "F", minPercent: 0, maxPercent: 59.99, gpaPoints: 0, passing: false },
          ],
        },
        effectiveFrom: "2027-08-16",
      })
      .returning();

    const context = {
      actorPersonId: operator.id,
      capabilities: new Set([
        "academic_year.manage",
        "academic_year.activate",
      ]),
      scope: {
        organizationIds: [hostOrg.id],
        programIds: [program.id],
        siteIds: [site.id],
      },
      requestId: `gf23-${suffix}`,
    };

    const schoolYearId = await academicTime.createSchoolYear(context, {
      organizationId: hostOrg.id,
      programId: program.id,
      siteId: site.id,
      key: `2027-2028-${suffix}`,
      name: "2027–2028",
      startsOn: "2027-08-16",
      endsOn: "2028-06-02",
      gradeScaleId: gradeScale.id,
      timezone: "America/Los_Angeles",
    });

    await expect(
      academicTime.activateSchoolYear(context, schoolYearId),
    ).rejects.toThrow("at least one Term");

    const fallTermId = await academicTime.createTerm(context, {
      schoolYearId,
      key: `fall-${suffix}`,
      name: "Fall Semester",
      sequence: 1,
      startsOn: "2027-08-16",
      endsOn: "2027-12-19",
    });

    await expect(
      academicTime.createTerm(context, {
        schoolYearId,
        key: `overlap-${suffix}`,
        name: "Overlapping Term",
        sequence: 2,
        startsOn: "2027-12-01",
        endsOn: "2028-01-15",
      }),
    ).rejects.toThrow("cannot overlap");

    await expect(
      academicTime.createGradingPeriod(context, {
        termId: fallTermId,
        key: `bad-q1-${suffix}`,
        name: "Bad Quarter",
        sequence: 1,
        startsOn: "2027-08-01",
        endsOn: "2027-10-15",
      }),
    ).rejects.toThrow("must fit within Term");

    const gradingPeriodId = await academicTime.createGradingPeriod(context, {
      termId: fallTermId,
      key: `q1-${suffix}`,
      name: "Quarter 1",
      sequence: 1,
      startsOn: "2027-08-16",
      endsOn: "2027-10-15",
      gradePostingOpensAt: new Date("2027-10-10T15:00:00.000Z"),
      gradePostingClosesAt: new Date("2027-10-20T23:59:00.000Z"),
    });

    await expect(
      academicTime.activateSchoolYear(context, schoolYearId),
    ).rejects.toThrow("active AcademicCalendar");

    const calendarId = await academicTime.createAcademicCalendar(context, {
      schoolYearId,
      name: "Primary Academic Calendar",
    });

    const calendarDayId = await academicTime.setAcademicCalendarDay(context, {
      academicCalendarId: calendarId,
      calendarDate: "2027-09-14",
      type: "instructional",
      instructionalMinutes: 360,
    });
    expect(await academicTime.setAcademicCalendarDay(context, {
      academicCalendarId: calendarId,
      calendarDate: "2027-09-14",
      type: "special",
      title: "Adjusted schedule",
      instructionalMinutes: 300,
      notes: "Testing calendar revision",
    })).toBe(calendarDayId);

    await expect(
      academicTime.activateSchoolYear(context, schoolYearId),
    ).rejects.toThrow("ScheduleTemplate");

    const scheduleTemplateId =
      await academicTime.createScheduleTemplate(context, {
        schoolYearId,
        programId: program.id,
        name: "Hybrid Tuesday/Thursday",
        effectiveFrom: "2027-08-16",
        periods: [
          {
            dayOfWeek: 2,
            sequence: 1,
            label: "Morning Block",
            startsAtLocal: "08:30:00",
            endsAtLocal: "10:00:00",
          },
          {
            dayOfWeek: 4,
            sequence: 1,
            label: "Morning Block",
            startsAtLocal: "08:30:00",
            endsAtLocal: "10:00:00",
          },
        ],
      });

    expect(scheduleTemplateId).toBeTruthy();

    await academicTime.activateSchoolYear(context, schoolYearId);

    const [activeYear] = await db
      .select()
      .from(schema.schoolYears)
      .where((await import("drizzle-orm")).eq(schema.schoolYears.id, schoolYearId));

    expect(activeYear.status).toBe("active");

    const { and, eq } = await import("drizzle-orm");
    const calendarDayAudits = await db.select().from(schema.auditEvents).where(and(
      eq(schema.auditEvents.resourceId, calendarDayId),
      eq(schema.auditEvents.action, "academic_calendar.day.set"),
    ));
    expect(calendarDayAudits).toHaveLength(2);
    expect(calendarDayAudits[0]!.before).toBeNull();
    expect(calendarDayAudits[1]!.before).toMatchObject({
      type: "instructional", instructionalMinutes: 360,
    });
    expect(calendarDayAudits[1]!.after).toMatchObject({
      type: "special", title: "Adjusted schedule", instructionalMinutes: 300,
    });
    expect(calendarDayAudits.every(row => row.context.requestId === context.requestId)).toBe(true);

    const calendarDayEvents = await db.select().from(schema.domainEvents).where(and(
      eq(schema.domainEvents.aggregateId, calendarId),
      eq(schema.domainEvents.eventType, "AcademicCalendarChanged"),
    ));
    expect(calendarDayEvents.some(event => event.payload.operation === "create_day")).toBe(true);
    expect(calendarDayEvents.some(event => event.payload.operation === "update_day")).toBe(true);

    for (const entry of [
      { id: fallTermId, type: "term", action: "term.create", event: "TermCreated" },
      { id: gradingPeriodId, type: "grading_period", action: "grading_period.create", event: "GradingPeriodCreated" },
    ]) {
      const audits = await db.select().from(schema.auditEvents).where(and(
        eq(schema.auditEvents.resourceId, entry.id),
        eq(schema.auditEvents.action, entry.action),
      ));
      expect(audits).toHaveLength(1);
      expect(audits[0].context.requestId).toBe(context.requestId);
      expect(await db.select().from(schema.domainEvents).where(and(
        eq(schema.domainEvents.aggregateId, entry.id),
        eq(schema.domainEvents.eventType, entry.event),
      ))).toHaveLength(1);
    }

    const activationEvents = await db
      .select()
      .from(schema.domainEvents)
      .where(
        (await import("drizzle-orm")).eq(
          schema.domainEvents.eventType,
          "SchoolYearActivated",
        ),
      );

    expect(
      activationEvents.some((event) => event.aggregateId === schoolYearId),
    ).toBe(true);
  }, 120000);

  async function seedActivatableYear(options: { onsite: boolean }) {
    const [{ db }, schema, academicTime] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("@/modules/academic-time/school-year-service"),
    ]);

    const suffix = crypto.randomUUID().slice(0, 8);

    const [jurisdiction] = await db
      .insert(schema.jurisdictions)
      .values({
        code: `gf23-${suffix}`,
        name: "GF23 Test Jurisdiction",
      })
      .returning();

    const [canOrg] = await db
      .insert(schema.organizations)
      .values({
        type: "can_network",
        name: `CAN GF23 ${suffix}`,
        slug: `can-gf23-${suffix}`,
      })
      .returning();

    const [hostOrg] = await db
      .insert(schema.organizations)
      .values({
        type: "christian_school",
        name: `GF23 School ${suffix}`,
        slug: `gf23-school-${suffix}`,
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
        name: "CAN High School Extension",
        slug: `hs-${suffix}`,
        gradeRange: { min: "9", max: "12" },
        deliveryModel: options.onsite
          ? {
              onsite: true,
              asynchronous: true,
              liveOnline: true,
              onsiteDaysPerWeek: 2,
            }
          : {
              onsite: false,
              asynchronous: true,
              liveOnline: false,
            },
        hostOrganizationId: hostOrg.id,
        academicProviderOrganizationId: canOrg.id,
        creditIssuingOrganizationId: canOrg.id,
      })
      .returning();

    const [operator] = await db
      .insert(schema.people)
      .values({
        legalFirstName: "Alex",
        legalLastName: `Academic-${suffix}`,
      })
      .returning();

    const [gradeScale] = await db
      .insert(schema.gradeScales)
      .values({
        owningOrganizationId: hostOrg.id,
        name: "Standard 4.0",
        version: 1,
        configuration: {
          entries: [
            { label: "A", minPercent: 90, maxPercent: 100, gpaPoints: 4, passing: true },
            { label: "B", minPercent: 80, maxPercent: 89.99, gpaPoints: 3, passing: true },
            { label: "C", minPercent: 70, maxPercent: 79.99, gpaPoints: 2, passing: true },
            { label: "D", minPercent: 60, maxPercent: 69.99, gpaPoints: 1, passing: true },
            { label: "F", minPercent: 0, maxPercent: 59.99, gpaPoints: 0, passing: false },
          ],
        },
        effectiveFrom: "2027-08-16",
      })
      .returning();

    const context = {
      actorPersonId: operator.id,
      capabilities: new Set([
        "academic_year.manage",
        "academic_year.activate",
      ]),
      scope: {
        organizationIds: [hostOrg.id],
        programIds: [program.id],
        siteIds: [site.id],
      },
      requestId: `gf23-${suffix}`,
    };

    const schoolYearId = await academicTime.createSchoolYear(context, {
      organizationId: hostOrg.id,
      programId: program.id,
      siteId: site.id,
      key: `2027-2028-${suffix}`,
      name: "2027–2028",
      startsOn: "2027-08-16",
      endsOn: "2028-06-02",
      gradeScaleId: gradeScale.id,
      timezone: "America/Los_Angeles",
    });

    const fallTermId = await academicTime.createTerm(context, {
      schoolYearId,
      key: `fall-${suffix}`,
      name: "Fall Semester",
      sequence: 1,
      startsOn: "2027-08-16",
      endsOn: "2027-12-19",
    });

    await academicTime.createGradingPeriod(context, {
      termId: fallTermId,
      key: `q1-${suffix}`,
      name: "Quarter 1",
      sequence: 1,
      startsOn: "2027-08-16",
      endsOn: "2027-10-15",
      gradePostingOpensAt: new Date("2027-10-10T15:00:00.000Z"),
      gradePostingClosesAt: new Date("2027-10-20T23:59:00.000Z"),
    });

    await academicTime.createAcademicCalendar(context, {
      schoolYearId,
      name: "Primary Academic Calendar",
    });

    return {
      db,
      schema,
      academicTime,
      suffix,
      canOrg,
      hostOrg,
      site,
      program,
      context,
      schoolYearId,
    };
  }

  it("activates an asynchronous program-scoped year without a schedule template", async () => {
    const { db, schema, academicTime, context, schoolYearId } =
      await seedActivatableYear({ onsite: false });

    // No ScheduleTemplate is created: onsite is false, so activation must
    // succeed with only terms, grading periods, and an active calendar.
    await academicTime.activateSchoolYear(context, schoolYearId);

    const { eq } = await import("drizzle-orm");
    const [activeYear] = await db
      .select()
      .from(schema.schoolYears)
      .where(eq(schema.schoolYears.id, schoolYearId));

    expect(activeYear.status).toBe("active");
  });

  it("re-activation is idempotent and emits a single SchoolYearActivated event", async () => {
    const { db, schema, academicTime, context, schoolYearId } =
      await seedActivatableYear({ onsite: false });

    await academicTime.activateSchoolYear(context, schoolYearId);
    await expect(
      academicTime.activateSchoolYear(context, schoolYearId),
    ).resolves.toBeUndefined();

    const { and, eq } = await import("drizzle-orm");

    const [activeYear] = await db
      .select()
      .from(schema.schoolYears)
      .where(eq(schema.schoolYears.id, schoolYearId));
    expect(activeYear.status).toBe("active");

    const activationEvents = await db
      .select()
      .from(schema.domainEvents)
      .where(
        and(
          eq(schema.domainEvents.aggregateId, schoolYearId),
          eq(schema.domainEvents.eventType, "SchoolYearActivated"),
        ),
      );
    expect(activationEvents).toHaveLength(1);
  });

  it("denies activation from an actor outside the year's organization", async () => {
    const { academicTime, context, canOrg, schoolYearId } =
      await seedActivatableYear({ onsite: false });

    const wrongOrgContext = {
      ...context,
      scope: {
        ...context.scope,
        organizationIds: [canOrg.id],
      },
    };

    await expect(
      academicTime.activateSchoolYear(wrongOrgContext, schoolYearId),
    ).rejects.toThrow("Missing required capability or scope");
  });

  it("denies activation from an actor missing site and program scope", async () => {
    const { academicTime, context, schoolYearId } =
      await seedActivatableYear({ onsite: false });

    const unscopedContext = {
      ...context,
      scope: {
        organizationIds: context.scope.organizationIds,
        programIds: [],
        siteIds: [],
      },
    };

    await expect(
      academicTime.activateSchoolYear(unscopedContext, schoolYearId),
    ).rejects.toThrow("Missing required capability or scope");
  });
});

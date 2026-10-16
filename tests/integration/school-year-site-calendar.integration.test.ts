import { describe, expect, it } from "vitest";

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("GF23 site-scoped calendars", () => {
  it("allows different Sites to operate different school-year dates without forking shared academic defaults", async () => {
    const [{ db }, schema, academicTime] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("@/modules/academic-time/school-year-service"),
    ]);

    const suffix = crypto.randomUUID().slice(0, 8);

    const [org] = await db.insert(schema.organizations).values({
      type: "christian_school",
      name: `Multi-site School ${suffix}`,
      slug: `multi-site-${suffix}`,
    }).returning();

    const [jurisdictionWA] = await db.insert(schema.jurisdictions).values({
      code: `WA-${suffix}`,
      name: "Washington",
    }).returning();

    const [jurisdictionFL] = await db.insert(schema.jurisdictions).values({
      code: `FL-${suffix}`,
      name: "Florida",
    }).returning();

    const sites = await db.insert(schema.sites).values([
      {
        organizationId: org.id,
        name: "Washington Campus",
        slug: `wa-${suffix}`,
        timezone: "America/Los_Angeles",
      },
      {
        organizationId: org.id,
        name: "Florida Campus",
        slug: `fl-${suffix}`,
        timezone: "America/New_York",
      },
    ]).returning();

    const waSite = sites[0]!;
    const flSite = sites[1]!;

    const programs = await db.insert(schema.programs).values([
      {
        organizationId: org.id,
        siteId: waSite.id,
        jurisdictionId: jurisdictionWA.id,
        type: "high_school_extension",
        status: "active",
        name: "CAN High School - WA",
        slug: `can-wa-${suffix}`,
        gradeRange: { min: "9", max: "12" },
        deliveryModel: { onsite: true, asynchronous: true },
        hostOrganizationId: org.id,
        academicProviderOrganizationId: org.id,
        creditIssuingOrganizationId: org.id,
      },
      {
        organizationId: org.id,
        siteId: flSite.id,
        jurisdictionId: jurisdictionFL.id,
        type: "high_school_extension",
        status: "active",
        name: "CAN High School - FL",
        slug: `can-fl-${suffix}`,
        gradeRange: { min: "9", max: "12" },
        deliveryModel: { onsite: true, asynchronous: true },
        hostOrganizationId: org.id,
        academicProviderOrganizationId: org.id,
        creditIssuingOrganizationId: org.id,
      },
    ]).returning();

    const waProgram = programs[0]!;
    const flProgram = programs[1]!;

    const [operator] = await db.insert(schema.people).values({
      legalFirstName: "Alex",
      legalLastName: `Calendar-${suffix}`,
    }).returning();

    const [gradeScale] = await db.insert(schema.gradeScales).values({
      owningOrganizationId: org.id,
      name: "Shared Standard 4.0",
      version: 1,
      configuration: {
        entries: [
          { label: "A", minPercent: 90, maxPercent: 100, gpaPoints: 4, passing: true },
          { label: "F", minPercent: 0, maxPercent: 89.99, gpaPoints: 0, passing: false },
        ],
      },
    }).returning();

    const context = {
      actorPersonId: operator.id,
      capabilities: new Set(["academic_year.manage"]),
      scope: {
        organizationIds: [org.id],
        siteIds: [waSite.id, flSite.id],
        programIds: [waProgram.id, flProgram.id],
      },
    };

    const waYearId = await academicTime.createSchoolYear(context, {
      organizationId: org.id,
      programId: waProgram.id,
      siteId: waSite.id,
      key: "2027-2028",
      name: "2027–2028",
      startsOn: "2027-09-01",
      endsOn: "2028-06-16",
      gradeScaleId: gradeScale.id,
      timezone: waSite.timezone,
    });

    const flYearId = await academicTime.createSchoolYear(context, {
      organizationId: org.id,
      programId: flProgram.id,
      siteId: flSite.id,
      key: "2027-2028",
      name: "2027–2028",
      startsOn: "2027-08-10",
      endsOn: "2028-05-26",
      gradeScaleId: gradeScale.id,
      timezone: flSite.timezone,
    });

    const years = await db.select().from(schema.schoolYears);
    const waYear = years.find((year) => year.id === waYearId)!;
    const flYear = years.find((year) => year.id === flYearId)!;

    expect(waYear.siteId).toBe(waSite.id);
    expect(flYear.siteId).toBe(flSite.id);
    expect(waYear.startsOn).toBe("2027-09-01");
    expect(flYear.startsOn).toBe("2027-08-10");
    expect(waYear.startsOn).not.toBe(flYear.startsOn);
  });
});

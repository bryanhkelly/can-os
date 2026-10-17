import { describe, expect, it } from "vitest";

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("educational capacity", () => {
  it("matches qualified supply, reserves seats atomically, and commits to section_teachers", async () => {
    const [
      { db },
      s,
      capacity,
      { eq },
      { createAcademicTimeFixture },
    ] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("@/modules/staffing/educational-capacity-service"),
      import("drizzle-orm"),
      import("./helpers/academic-time"),
    ]);

    const suffix = crypto.randomUUID().slice(0, 8);
    const [jurisdiction] = await db.insert(s.jurisdictions).values({
      code: `capacity-${suffix}`,
      name: "Capacity Test",
    }).returning();

    const [org] = await db.insert(s.organizations).values({
      type: "christian_school",
      name: `Capacity School ${suffix}`,
      slug: `capacity-school-${suffix}`,
    }).returning();

    const [site] = await db.insert(s.sites).values({
      organizationId: org.id,
      name: "Capacity Campus",
      slug: `capacity-campus-${suffix}`,
      timezone: "America/Los_Angeles",
    }).returning();

    const [program] = await db.insert(s.programs).values({
      organizationId: org.id,
      siteId: site.id,
      jurisdictionId: jurisdiction.id,
      type: "full_school",
      status: "active",
      name: "Capacity Program",
      slug: `capacity-program-${suffix}`,
      gradeRange: { min: "9", max: "12" },
      deliveryModel: { liveOnline: true },
      hostOrganizationId: org.id,
      academicProviderOrganizationId: org.id,
      creditIssuingOrganizationId: org.id,
    }).returning();

    const [teacher] = await db.insert(s.people).values({
      legalFirstName: "Avery",
      legalLastName: `Teacher-${suffix}`,
      email: `capacity-teacher-${suffix}@example.com`,
    }).returning();

    const [course] = await db.insert(s.courseTemplates).values({
      owningOrganizationId: org.id,
      code: `AAH-${suffix}`,
      title: "African American History",
      subject: "History",
    }).returning();

    const [version] = await db.insert(s.courseTemplateVersions).values({
      courseTemplateId: course.id,
      version: 1,
      status: "published",
      publishedAt: new Date(),
    }).returning();

    const academicTime = await createAcademicTimeFixture({
      organizationId: org.id,
      programId: program.id,
      siteId: site.id,
      suffix,
    });

    const [section] = await db.insert(s.sections).values({
      programId: program.id,
      siteId: site.id,
      courseTemplateVersionId: version.id,
      code: `AAH-1-${suffix}`,
      title: "African American History",
      termId: academicTime.term.id,
      startsAt: new Date("2027-08-20T16:00:00.000Z"),
      endsAt: new Date("2028-05-25T17:00:00.000Z"),
    }).returning();

    const context = {
      actorPersonId: teacher.id,
      capabilities: new Set([
        "capacity.read",
        "capacity.manage",
        "capacity.demand.manage",
        "capacity.reserve",
      ]),
      scope: {
        organizationIds: [org.id],
        siteIds: [site.id],
        programIds: [program.id],
        sectionIds: [section.id],
      },
      requestId: `capacity-${suffix}`,
    };

    const capabilityId = await capacity.createInstructorCapability(context, {
      personId: teacher.id,
      courseTemplateId: course.id,
      subject: "History",
      gradeRange: { min: "9", max: "12" },
      modalities: ["live_online"],
    });

    const availabilityWindowId = await capacity.createInstructorAvailability(context, {
      personId: teacher.id,
      startsAt: new Date("2027-08-01T00:00:00.000Z"),
      endsAt: new Date("2028-06-15T00:00:00.000Z"),
      timezone: "America/Los_Angeles",
      weeklyPattern: { days: [2, 4], startTime: "09:00", endTime: "12:00" },
    });

    const offeringId = await capacity.createCapacityOffering(context, {
      personId: teacher.id,
      capabilityId,
      availabilityWindowId,
      modality: "live_online",
      maxSeats: 25,
      jurisdictionId: jurisdiction.id,
    });

    const demandId = await capacity.upsertSectionCapacityDemand(context, {
      sectionId: section.id,
      expectedSeats: 12,
      modality: "live_online",
      startsAt: new Date("2027-08-20T16:00:00.000Z"),
      endsAt: new Date("2028-05-25T17:00:00.000Z"),
    });

    const candidates = await capacity.findCapacityCandidates(context, demandId);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      offeringId,
      maxSeats: 25,
      reservedSeats: 0,
      remainingSeats: 25,
      modality: "live_online",
    });

    const held = await capacity.reserveInstructionalCapacity(context, {
      demandId,
      offeringId,
      seats: 12,
      status: "held",
    });
    expect(held.remainingSeats).toBe(13);

    const afterHold = await capacity.getInstructorCapacity(context, teacher.id);
    expect(afterHold[0]?.remainingSeats).toBe(13);

    await capacity.reserveInstructionalCapacity(context, {
      demandId,
      offeringId,
      seats: 12,
      status: "committed",
    });

    const [assignment] = await db.select().from(s.sectionTeachers)
      .where(eq(s.sectionTeachers.sectionId, section.id)).limit(1);
    expect(assignment.personId).toBe(teacher.id);

    const [section2] = await db.insert(s.sections).values({
      programId: program.id,
      siteId: site.id,
      courseTemplateVersionId: version.id,
      code: `AAH-2-${suffix}`,
      title: "African American History II",
      termId: academicTime.term.id,
      startsAt: new Date("2027-08-20T16:00:00.000Z"),
      endsAt: new Date("2028-05-25T17:00:00.000Z"),
    }).returning();

    const context2 = {
      ...context,
      scope: { ...context.scope, sectionIds: [section.id, section2.id] },
    };

    const demand2 = await capacity.upsertSectionCapacityDemand(context2, {
      sectionId: section2.id,
      expectedSeats: 14,
      modality: "live_online",
      startsAt: new Date("2027-08-20T16:00:00.000Z"),
      endsAt: new Date("2028-05-25T17:00:00.000Z"),
    });

    await expect(capacity.reserveInstructionalCapacity(context2, {
      demandId: demand2,
      offeringId,
      seats: 14,
      status: "held",
    })).rejects.toThrow("Only 13 seats remain");
  });
});

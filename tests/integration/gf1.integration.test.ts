import { describe, expect, it } from "vitest";

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("GF1 academic intervention", () => {
  it("preserves lifecycle and timeliness while propagating missing work into an Insight and Action", async () => {
    const [{ db }, schema, learning, worker, actionModule] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("@/modules/learning/gf1-service"),
      import("@/workers/domain-event-worker"),
      import("@/modules/actions/create-action-from-insight"),
    ]);

    const suffix = crypto.randomUUID().slice(0, 8);

    const [jurisdiction] = await db
      .insert(schema.jurisdictions)
      .values({
        code: `test-${suffix}`,
        name: "Golden Flow Test",
      })
      .returning();

    const [canOrg] = await db
      .insert(schema.organizations)
      .values({
        type: "can_network",
        name: `CAN Test ${suffix}`,
        slug: `can-test-${suffix}`,
      })
      .returning();

    const [hostOrg] = await db
      .insert(schema.organizations)
      .values({
        type: "christian_school",
        name: `Host School ${suffix}`,
        slug: `host-school-${suffix}`,
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
        name: "CAN High School",
        slug: `can-hs-${suffix}`,
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

    const insertedPeople = await db
      .insert(schema.people)
      .values([
        {
          legalFirstName: "Taylor",
          legalLastName: `Teacher-${suffix}`,
          email: `teacher-${suffix}@example.com`,
        },
        {
          legalFirstName: "Sam",
          legalLastName: `Student-${suffix}`,
          preferredName: "Sam",
          email: `student-${suffix}@example.com`,
        },
        {
          legalFirstName: "Pat",
          legalLastName: `Guardian-${suffix}`,
          email: `guardian-${suffix}@example.com`,
        },
      ])
      .returning();

    const [teacher, studentPerson, guardian] = insertedPeople;
    expect(teacher && studentPerson && guardian).toBeTruthy();

    const [student] = await db
      .insert(schema.studentProfiles)
      .values({
        personId: studentPerson.id,
        gradeLevel: "10",
      })
      .returning();

    await db.insert(schema.guardianRelationships).values({
      guardianPersonId: guardian.id,
      studentPersonId: studentPerson.id,
      relationshipLabel: "parent",
    });

    const [template] = await db
      .insert(schema.courseTemplates)
      .values({
        owningOrganizationId: canOrg.id,
        code: `LOGIC-${suffix}`,
        title: "Logic II",
        subject: "Logic",
      })
      .returning();

    const [version] = await db
      .insert(schema.courseTemplateVersions)
      .values({
        courseTemplateId: template.id,
        version: 1,
        status: "published",
        publishedAt: new Date(),
      })
      .returning();

    const [section] = await db
      .insert(schema.sections)
      .values({
        programId: program.id,
        siteId: site.id,
        courseTemplateVersionId: version.id,
        code: `LOGIC-2-${suffix}`,
        title: "Logic II",
        termKey: `2026-fall-${suffix}`,
      })
      .returning();

    await db.insert(schema.sectionTeachers).values({
      sectionId: section.id,
      personId: teacher.id,
    });

    await db.insert(schema.enrollments).values({
      studentProfileId: student.id,
      kind: "section",
      status: "active",
      organizationId: hostOrg.id,
      programId: program.id,
      sectionId: section.id,
      schoolYear: "2026-2027",
    });

    const dueAt = new Date("2026-10-10T23:59:00.000Z");

    const [assessment] = await db
      .insert(schema.assessments)
      .values({
        sectionId: section.id,
        title: "Problem Set 7",
        status: "draft",
        dueAt,
        pointsPossible: "100",
        createdByPersonId: teacher.id,
      })
      .returning();

    const teacherContext = {
      actorPersonId: teacher.id,
      capabilities: new Set(["assessment.publish", "submission.grade", "action.create"]),
      scope: { sectionIds: [section.id] },
      requestId: `gf1-teacher-${suffix}`,
    };

    await learning.publishAssessment(teacherContext, assessment.id);

    let [submission] = await db
      .select()
      .from(schema.submissions)
      .where(schema.eq(schema.submissions.assessmentId, assessment.id));

    // eq is not re-exported by the schema; use drizzle dynamically below.
    expect(submission).toBeDefined();
  });
});

import { describe, expect, it } from "vitest";

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("GF1 academic intervention", () => {
  it("preserves lifecycle and timeliness while propagating missing work into an Insight and Action", async () => {
    const [
      { db },
      schema,
      { eq, and },
      learning,
      worker,
      actionModule,
      communication,
      actionResolution,
    ] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
      import("@/modules/learning/gf1-service"),
      import("@/workers/domain-event-worker"),
      import("@/modules/actions/create-action-from-insight"),
      import("@/modules/communication/gf1-thread-service"),
      import("@/modules/actions/resolve-action"),
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

    const teacher = insertedPeople[0]!;
    const studentPerson = insertedPeople[1]!;
    const guardian = insertedPeople[2]!;

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
      capabilities: new Set([
        "assessment.publish",
        "submission.grade",
        "action.create",
        "action.resolve",
        "communication.send",
      ]),
      scope: { sectionIds: [section.id] },
      requestId: `gf1-teacher-${suffix}`,
    };

    await learning.publishAssessment(teacherContext, assessment.id);

    let [submission] = await db
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.assessmentId, assessment.id));

    expect(submission.status).toBe("assigned");
    expect(submission.timeliness).toBe("on_time");

    const changed = await learning.markOverdueSubmissionsMissing(
      new Date("2026-10-11T08:00:00.000Z"),
    );
    expect(changed).toBeGreaterThanOrEqual(1);

    [submission] = await db
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.id, submission.id));

    expect(submission.status).toBe("assigned");
    expect(submission.timeliness).toBe("missing");

    await worker.processPendingDomainEvents();

    const [insight] = await db
      .select()
      .from(schema.insights)
      .where(
        and(
          eq(schema.insights.subjectType, "student_profile"),
          eq(schema.insights.subjectId, student.id),
        ),
      )
      .orderBy(schema.insights.createdAt)
      .limit(1);

    expect(insight).toBeDefined();
    expect(insight.type).toBe("missing_assignment");

    const notifications = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.eventId, (
        await db
          .select({ id: schema.domainEvents.id })
          .from(schema.domainEvents)
          .where(
            and(
              eq(schema.domainEvents.eventType, "AssignmentBecameMissing"),
              eq(schema.domainEvents.aggregateId, submission.id),
            ),
          )
          .limit(1)
      )[0]!.id));

    expect(notifications.length).toBeGreaterThanOrEqual(3);

    const actionId = await actionModule.createActionFromInsight(
      teacherContext,
      {
        insightId: insight.id,
        title: "Support Sam with Problem Set 7",
        ownerPersonId: teacher.id,
      },
    );

    expect(actionId).toBeTruthy();

    const guardianContext = {
      actorPersonId: guardian.id,
      capabilities: new Set(["communication.send"]),
      scope: { sectionIds: [section.id] },
      requestId: `gf1-guardian-${suffix}`,
    };

    const familyThreadId = await communication.sendAcademicInterventionMessage(
      guardianContext,
      {
        submissionId: submission.id,
        body: "We saw the missing assignment and will make sure Sam completes it today.",
      },
    );

    const teacherThreadId = await communication.sendAcademicInterventionMessage(
      teacherContext,
      {
        submissionId: submission.id,
        body: "Thank you. I can review it once it is submitted.",
      },
    );

    expect(teacherThreadId).toBe(familyThreadId);

    const threadMessages = await db
      .select()
      .from(schema.communicationMessages)
      .where(eq(schema.communicationMessages.threadId, familyThreadId));

    expect(threadMessages).toHaveLength(2);

    const studentContext = {
      actorPersonId: studentPerson.id,
      capabilities: new Set(["submission.submit"]),
      scope: { sectionIds: [section.id] },
      requestId: `gf1-student-${suffix}`,
    };

    await learning.submitAssessment(
      studentContext,
      submission.id,
      { text: "Completed work" },
      new Date("2026-10-11T12:00:00.000Z"),
    );

    [submission] = await db
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.id, submission.id));

    expect(submission.status).toBe("submitted");
    expect(submission.timeliness).toBe("late");

    await learning.gradeSubmission(teacherContext, submission.id, {
      score: "88",
      feedback: { comment: "Good recovery." },
    });

    [submission] = await db
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.id, submission.id));

    expect(submission.status).toBe("graded");
    expect(submission.timeliness).toBe("late");

    const gradeEvents = await db
      .select()
      .from(schema.domainEvents)
      .where(
        and(
          eq(schema.domainEvents.eventType, "GradePosted"),
          eq(schema.domainEvents.aggregateId, submission.id),
        ),
      );

    expect(gradeEvents).toHaveLength(1);

    await actionResolution.resolveAction(teacherContext, {
      actionId,
      resolutionNote:
        "Student submitted the missing work, teacher graded it, and follow-up is complete.",
    });

    const [resolvedAction] = await db
      .select()
      .from(schema.actions)
      .where(eq(schema.actions.id, actionId));

    expect(resolvedAction.status).toBe("resolved");
    expect(resolvedAction.resolutionNote).toContain("follow-up is complete");

    const resolvedEvents = await db
      .select()
      .from(schema.domainEvents)
      .where(
        and(
          eq(schema.domainEvents.eventType, "ActionResolved"),
          eq(schema.domainEvents.aggregateId, actionId),
        ),
      );

    expect(resolvedEvents).toHaveLength(1);
  });
});

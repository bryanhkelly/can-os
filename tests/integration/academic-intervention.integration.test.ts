import { describe, expect, it, vi } from "vitest";
import type { CommandContext } from "@/domain/command-context";
import { resolveAccessContext } from "@/domain/access-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { updateOperationsAction, assignOperationsAction } from "@/modules/operations/action-workspace.functions";
import { acceptInsight } from "@/modules/operations/insights.functions";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ validator() { return this; }, handler(callback: unknown) { return callback; } }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => new Request("http://localhost") }));
vi.mock("@/modules/identity/command-context.server", () => ({ getCommandContext: vi.fn() }));

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("academic intervention", () => {
  it("preserves lifecycle and timeliness while propagating missing work into an Insight and Action", async () => {
    const [
      { db },
      schema,
      { eq, and, inArray },
      learning,
      worker,
      actionModule,
      communication,
      actionResolution,
    ] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
      import("@/modules/learning/missing-work-service"),
      import("@/workers/domain-event-worker"),
      import("@/modules/actions/create-action-from-insight"),
      import("@/modules/communication/thread-service"),
      import("@/modules/actions/resolve-action"),
    ]);

    const suffix = crypto.randomUUID().slice(0, 8);
    const { createAcademicTimeFixture } = await import("./helpers/academic-time");

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
      canViewAcademics:true,canManageEnrollment:true,
      metadata:{verification:"verified",source:"independent_test_review"},
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

    const academicTime = await createAcademicTimeFixture({
      organizationId: hostOrg.id,
      programId: program.id,
      siteId: site.id,
      suffix,
    });

    const [section] = await db
      .insert(schema.sections)
      .values({
        programId: program.id,
        siteId: site.id,
        courseTemplateVersionId: version.id,
        code: `LOGIC-2-${suffix}`,
        title: "Logic II",
        termId: academicTime.term.id,
        scheduleTemplateId: academicTime.scheduleTemplate.id,
      })
      .returning();

    await db.insert(schema.sectionTeachers).values({
      sectionId: section.id,
      personId: teacher.id,
    });

    await db.insert(schema.enrollments).values({
      studentProfileId: student.id,kind:"program",status:"active",
      organizationId:hostOrg.id,programId:program.id,
      schoolYearId:academicTime.schoolYear.id,
    });
    await db.insert(schema.enrollments).values({
      studentProfileId: student.id,
      kind: "section",
      status: "active",
      organizationId: hostOrg.id,
      programId: program.id,
      sectionId: section.id,
      schoolYearId: academicTime.schoolYear.id,
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

    const teacherContext: CommandContext = {
      actorPersonId: teacher.id,
      capabilities: new Set([
        "assessment.publish",
        "submission.grade",
        "action.create",
        "action.resolve",
        "communication.send",
      ]),
      scope: { organizationIds: [hostOrg.id], siteIds: [site.id], programIds: [program.id], sectionIds: [section.id] },
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

    // GF1 step 9: the Insight must carry delivery scope so site-scoped
    // support views (e.g. the coach caseload) can surface the signal.
    expect(insight.organizationId).toBe(hostOrg.id);
    expect(insight.siteId).toBe(site.id);
    expect(insight.programId).toBe(program.id);

    const coachVisibleInsights = await db
      .select({ id: schema.insights.id })
      .from(schema.insights)
      .where(
        and(
          eq(schema.insights.subjectType, "student_profile"),
          eq(schema.insights.siteId, site.id),
          eq(schema.insights.status, "open"),
        ),
      );

    expect(coachVisibleInsights.map((row) => row.id)).toContain(insight.id);

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

    // GF1 steps 6-8: student, guardian, and teacher are each notified with a
    // link back to the canonical submission resource.
    const notifiedPersonIds = new Set(
      notifications.map((row) => row.recipientPersonId),
    );
    expect(notifiedPersonIds).toContain(studentPerson.id);
    expect(notifiedPersonIds).toContain(guardian.id);
    expect(notifiedPersonIds).toContain(teacher.id);
    for (const row of notifications) {
      expect(row.resourceType).toBe("submission");
      expect(row.resourceId).toBe(submission.id);
    }

    const deniedContexts: CommandContext[] = [
      { ...teacherContext, actorPersonId: null },
      { ...teacherContext, capabilities: new Set() },
      { ...teacherContext, actorPersonId: guardian.id },
      ...[
        {},
        { ...teacherContext.scope, organizationIds: [] },
        { ...teacherContext.scope, organizationIds: [canOrg.id] },
        { ...teacherContext.scope, programIds: undefined },
        { ...teacherContext.scope, programIds: [] },
        { ...teacherContext.scope, programIds: [crypto.randomUUID()] },
        { ...teacherContext.scope, siteIds: undefined },
        { ...teacherContext.scope, siteIds: [] },
        { ...teacherContext.scope, siteIds: [crypto.randomUUID()] },
        { ...teacherContext.scope, sectionIds: [] },
        { ...teacherContext.scope, sectionIds: [crypto.randomUUID()] },
      ].map(scope => ({ ...teacherContext, scope })),
    ];
    for (const context of deniedContexts) {
      await expect(actionModule.createActionFromInsight(context, {
        insightId: insight.id, title: "Unauthorized intervention",
      })).rejects.toThrow();
    }
    await expect(actionModule.createActionFromInsight(teacherContext, {
      insightId: insight.id, title: "Invalid owner", ownerPersonId: guardian.id,
    })).rejects.toThrow("staff relationship");
    expect((await db.select().from(schema.insights).where(eq(schema.insights.id, insight.id)))[0].status).toBe("open");
    expect(await db.select().from(schema.actions).where(eq(schema.actions.subjectId, student.id))).toHaveLength(0);

    const actionId = await actionModule.createActionFromInsight(
      teacherContext,
      {
        insightId: insight.id,
        title: "Support Sam with Problem Set 7",
        ownerPersonId: teacher.id,
      },
    );

    expect(actionId).toBeTruthy();

    // GF1 step 11: the Action inherits delivery scope from the Insight so
    // site-scoped work queues can surface it.
    const [createdAction] = await db
      .select()
      .from(schema.actions)
      .where(eq(schema.actions.id, actionId));

    expect(createdAction.organizationId).toBe(hostOrg.id);
    expect(createdAction.siteId).toBe(site.id);
    expect(createdAction.programId).toBe(program.id);

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

    // Process SubmissionReceived, GradePosted, ActionCreated, and message events.
    // GradePosted must project into both student and authorized-guardian views.
    await worker.processPendingDomainEvents();

    const gradeNotifications = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.eventId, gradeEvents[0]!.id));

    const gradeRecipients = new Set(
      gradeNotifications.map((row) => row.recipientPersonId),
    );
    expect(gradeRecipients).toContain(studentPerson.id);
    expect(gradeRecipients).toContain(guardian.id);
    for (const row of gradeNotifications) {
      expect(row.type).toBe("grade_posted");
      expect(row.resourceType).toBe("submission");
      expect(row.resourceId).toBe(submission.id);
    }

    const lateSubmissionNotices = await db
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.type, "late_submission_received"),
          eq(schema.notifications.resourceId, submission.id),
        ),
      );
    expect(lateSubmissionNotices.some((row) => row.recipientPersonId === teacher.id)).toBe(true);

    const resolution = {
      actionId, resolutionNote: "  Student submitted the missing work, teacher graded it, and follow-up is complete.  ",
    };
    for (const context of deniedContexts) {
      await expect(actionResolution.resolveAction(context, resolution)).rejects.toThrow();
    }
    await expect(actionResolution.resolveAction(teacherContext, {
      actionId, resolutionNote: " \n ",
    })).rejects.toThrow("Resolution note required");

    await db.delete(schema.sectionTeachers).where(and(
      eq(schema.sectionTeachers.sectionId, section.id), eq(schema.sectionTeachers.personId, teacher.id),
    ));
    await expect(actionResolution.resolveAction(teacherContext, resolution)).rejects.toThrow("staff relationship");
    await db.insert(schema.sectionTeachers).values({ sectionId: section.id, personId: teacher.id });

    await db.update(schema.enrollments).set({ status: "withdrawn" }).where(eq(schema.enrollments.sectionId, section.id));
    await expect(actionResolution.resolveAction(teacherContext, resolution)).rejects.toThrow("student/section relationship");
    await db.update(schema.enrollments).set({ status: "active" }).where(eq(schema.enrollments.sectionId, section.id));
    await db.update(schema.sections).set({ active: false }).where(eq(schema.sections.id, section.id));
    await expect(actionResolution.resolveAction(teacherContext, resolution)).rejects.toThrow("student/section relationship");
    await db.update(schema.sections).set({ active: true }).where(eq(schema.sections.id, section.id));

    const [wrongSite] = await db.insert(schema.sites).values({
      organizationId: hostOrg.id, name: "Other Campus", slug: `other-${suffix}`,
    }).returning();
    await db.update(schema.actions).set({ siteId: wrongSite.id }).where(eq(schema.actions.id, actionId));
    await expect(actionResolution.resolveAction({
      ...teacherContext, scope: { ...teacherContext.scope, siteIds: [site.id, wrongSite.id] },
    }, resolution)).rejects.toThrow("student/section relationship");
    await db.update(schema.actions).set({ siteId: site.id }).where(eq(schema.actions.id, actionId));

    for (const type of ["support_referral", "guardian_consent", "group_moderation"]) {
      await db.update(schema.actions).set({ type }).where(eq(schema.actions.id, actionId));
      await expect(actionResolution.resolveAction(teacherContext, resolution)).rejects.toThrow("owning domain lifecycle");
    }
    await db.update(schema.actions).set({ type: "academic_intervention", status: "cancelled" }).where(eq(schema.actions.id, actionId));
    await expect(actionResolution.resolveAction(teacherContext, resolution)).rejects.toThrow("Cancelled Action");
    await db.update(schema.actions).set({ status: "open" }).where(eq(schema.actions.id, actionId));
    expect(await db.select().from(schema.domainEvents).where(and(
      eq(schema.domainEvents.aggregateId, actionId), eq(schema.domainEvents.eventType, "ActionResolved"),
    ))).toHaveLength(0);

    await Promise.all([
      actionResolution.resolveAction(teacherContext, resolution),
      actionResolution.resolveAction(teacherContext, resolution),
    ]);
    await actionResolution.resolveAction(teacherContext, resolution);
    await db.delete(schema.sectionTeachers).where(and(
      eq(schema.sectionTeachers.sectionId, section.id), eq(schema.sectionTeachers.personId, teacher.id),
    ));
    await expect(actionResolution.resolveAction(teacherContext, resolution)).rejects.toThrow("staff relationship");
    await db.insert(schema.sectionTeachers).values({ sectionId: section.id, personId: teacher.id });

    const [resolvedAction] = await db
      .select()
      .from(schema.actions)
      .where(eq(schema.actions.id, actionId));

    expect(resolvedAction.status).toBe("resolved");
    expect(resolvedAction.resolutionNote).toContain("follow-up is complete");
    expect(resolvedAction.resolutionNote).toBe(resolution.resolutionNote.trim());
    expect(await db.select().from(schema.auditEvents).where(and(
      eq(schema.auditEvents.resourceId, actionId), eq(schema.auditEvents.action, "action.resolve"),
    ))).toHaveLength(1);

    const [operator] = await db.insert(schema.people).values({
      legalFirstName: "Academic", legalLastName: `Registrar-${suffix}`,
    }).returning();
    const [account] = await db.insert(schema.accessAccounts).values({
      emailNormalized: `academic-operator-${suffix}@example.com`,
    }).returning();
    const [grant] = await db.insert(schema.accountPersonGrants).values({
      accountId: account.id, personId: operator.id, role: "registrar",
      organizationId: hostOrg.id, siteId: site.id,
    }).returning();
    const operatorContext = resolveAccessContext({
      accountId: account.id, sessionId: crypto.randomUUID(), activeGrantId: grant.id,
    }, [grant]);
    operatorContext.scope.programIds = [program.id];
    vi.mocked(getCommandContext).mockResolvedValue(operatorContext);

    const [operationalAction] = await db.insert(schema.actions).values({
      type: "academic_intervention", title: "Scoped operational follow-up",
      subjectType: "student_profile", subjectId: student.id,
      organizationId: hostOrg.id, siteId: site.id, programId: program.id, sectionId: section.id,
    }).returning();
    const operationalResolution = { actionId: operationalAction.id, resolutionNote: "Registrar follow-up complete" };
    const operation = { id: operationalAction.id, status: "resolved" as const, resolutionNote: operationalResolution.resolutionNote };
    await db.update(schema.accountPersonGrants).set({ active: false }).where(eq(schema.accountPersonGrants.id, grant.id));
    await expect(actionResolution.resolveAction(operatorContext, operationalResolution)).rejects.toThrow("staff relationship");
    await expect(updateOperationsAction({ data: operation })).rejects.toThrow("staff relationship");
    await db.update(schema.accountPersonGrants).set({ active: true, siteId: wrongSite.id }).where(eq(schema.accountPersonGrants.id, grant.id));
    await expect(actionResolution.resolveAction(operatorContext, operationalResolution)).rejects.toThrow("staff relationship");
    await db.update(schema.accountPersonGrants).set({ siteId: site.id }).where(eq(schema.accountPersonGrants.id, grant.id));
    await db.insert(schema.accountPersonGrants).values({
      accountId: account.id, personId: guardian.id, role: "teacher",
      organizationId: hostOrg.id, siteId: site.id,
    });
    await expect(assignOperationsAction({ data: {
      id: operationalAction.id, ownerPersonId: guardian.id, priority: "normal",
    } })).rejects.toThrow("staff relationship");
    await assignOperationsAction({ data: {
      id: operationalAction.id, ownerPersonId: operator.id, priority: "high",
    } });
    await updateOperationsAction({ data: operation });
    await updateOperationsAction({ data: operation });
    expect(await db.select().from(schema.domainEvents).where(and(
      eq(schema.domainEvents.aggregateId, operationalAction.id), eq(schema.domainEvents.eventType, "ActionResolved"),
    ))).toHaveLength(1);

    const [operationalInsight] = await db.insert(schema.insights).values({
      type: "missing_assignment", title: "Operator intervention", summary: "Missing work",
      subjectType: "student_profile", subjectId: student.id,
      organizationId: hostOrg.id, siteId: site.id, programId: program.id, sectionId: section.id,
    }).returning();
    operatorContext.scope.programIds = [];
    await expect(acceptInsight({ data: { insightId: operationalInsight.id } })).rejects.toThrow("academic Action scope");
    operatorContext.scope.programIds = [program.id];
    await expect(acceptInsight({ data: {
      insightId: operationalInsight.id, actionOwnerPersonId: guardian.id,
    } })).rejects.toThrow("staff relationship");
    await acceptInsight({ data: { insightId: operationalInsight.id, actionOwnerPersonId: operator.id } });

    const [siteWideAction] = await db.insert(schema.actions).values({
      type: "academic_intervention", title: "Site-wide follow-up",
      subjectType: "site", subjectId: site.id, organizationId: hostOrg.id, siteId: site.id,
    }).returning();
    await updateOperationsAction({ data: {
      id: siteWideAction.id, status: "resolved", resolutionNote: "Operational follow-up complete",
    } });
    expect((await db.select().from(schema.actions).where(eq(schema.actions.id, siteWideAction.id)))[0].status).toBe("resolved");

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

    // Resolve the final ActionResolved event too. A completed GF1 run should
    // not strand its own domain events in pending/unhandled state.
    await worker.processPendingDomainEvents();

    const flowEvents = await db
      .select({
        eventType: schema.domainEvents.eventType,
        status: schema.domainEvents.status,
        aggregateId: schema.domainEvents.aggregateId,
      })
      .from(schema.domainEvents)
      .where(
        inArray(schema.domainEvents.aggregateId, [
          assessment.id,
          submission.id,
          actionId,
          familyThreadId,
        ]),
      );

    for (const event of flowEvents) {
      expect(
        event.status,
        `${event.eventType} for ${event.aggregateId} should be processed`,
      ).toBe("processed");
    }

    // GF1 step 18: the audit log alone can reconstruct the complete flow.
    const flowAudit = await db
      .select({ action: schema.auditEvents.action })
      .from(schema.auditEvents)
      .where(
        inArray(schema.auditEvents.resourceId, [
          assessment.id,
          submission.id,
          actionId,
          familyThreadId,
        ]),
      );

    const auditActions = new Set(flowAudit.map((row) => row.action));
    for (const expected of [
      "assessment.publish",
      "submission.mark_missing",
      "communication.message_send",
      "submission.submit",
      "submission.grade",
      "action.create_from_insight",
      "action.resolve",
    ]) {
      expect(auditActions).toContain(expected);
    }
  });
});

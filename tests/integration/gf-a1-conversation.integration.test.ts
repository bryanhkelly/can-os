import { describe, expect, it } from "vitest";

const integration = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * GF-A1 — Ask CAN: Grounded Answer + conversation-created watches.
 *
 * Proves the agent runtime answers from canonical records under the asking
 * person's exact authorization, parks consequential actions behind human
 * approval, and produces durable subscriptions that deliver over the outbox
 * (the A1 -> A2 loop). The runtime is exercised directly with an explicit
 * actor context; the server-function layer only resolves the session.
 */
integration("GF-A1 Ask CAN conversation", () => {
  async function seedFamily() {
    const [{ db }, schema] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
    ]);
    const suffix = crypto.randomUUID().slice(0, 8);
    const { createAcademicTimeFixture } = await import("./helpers/academic-time");

    const [jurisdiction] = await db
      .insert(schema.jurisdictions)
      .values({ code: `test-${suffix}`, name: "GF-A1 Test" })
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

    const [teacher, studentPerson, guardian, outsider] = await db
      .insert(schema.people)
      .values([
        {
          legalFirstName: "Taylor",
          legalLastName: `Teacher-${suffix}`,
          email: `teacher-${suffix}@example.com`,
        },
        {
          legalFirstName: "Robert",
          legalLastName: `Student-${suffix}`,
          preferredName: "Bobby",
          email: `student-${suffix}@example.com`,
        },
        {
          legalFirstName: "Pat",
          legalLastName: `Guardian-${suffix}`,
          email: `guardian-${suffix}@example.com`,
        },
        {
          legalFirstName: "Randy",
          legalLastName: `Outsider-${suffix}`,
          email: `outsider-${suffix}@example.com`,
        },
      ])
      .returning();

    const [student] = await db
      .insert(schema.studentProfiles)
      .values({ personId: studentPerson!.id, gradeLevel: "10" })
      .returning();

    await db.insert(schema.guardianRelationships).values({
      guardianPersonId: guardian!.id,
      studentPersonId: studentPerson!.id,
      relationshipLabel: "parent",
    });

    const [template] = await db
      .insert(schema.courseTemplates)
      .values({
        owningOrganizationId: canOrg.id,
        code: `BIO-${suffix}`,
        title: "Biology",
        subject: "Science",
      })
      .returning();

    const [version] = await db
      .insert(schema.courseTemplateVersions)
      .values({
        courseTemplateId: template!.id,
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
        courseTemplateVersionId: version!.id,
        code: `BIO-1-${suffix}`,
        title: "Biology",
        termId: academicTime.term.id,
        scheduleTemplateId: academicTime.scheduleTemplate.id,
      })
      .returning();

    await db.insert(schema.sectionTeachers).values({
      sectionId: section!.id,
      personId: teacher!.id,
    });

    await db.insert(schema.enrollments).values({
      studentProfileId: student!.id,
      kind: "section",
      status: "active",
      organizationId: hostOrg.id,
      programId: program.id,
      sectionId: section!.id,
      schoolYearId: academicTime.schoolYear.id,
    });

    return {
      db,
      schema,
      suffix,
      teacher: teacher!,
      studentPerson: studentPerson!,
      guardian: guardian!,
      outsider: outsider!,
      student: student!,
      section: section!,
      site: site!,
    };
  }

  function contextFor(personId: string, capabilities: string[]) {
    return {
      actorPersonId: personId,
      capabilities: new Set(capabilities),
      scope: {},
      requestId: `gfa1-${crypto.randomUUID().slice(0, 8)}`,
    };
  }

  it("answers a progress question with evidence from canonical records", async () => {
    const { db, schema, teacher, student, guardian, outsider, section } = await seedFamily();
    const agent = await import("@/platform/agent");
    const learning = await import("@/modules/learning/missing-work-service");
    const { eq } = await import("drizzle-orm");

    const guardianContext = contextFor(guardian.id, ["student:related-read"]);

    // Give Bobby one graded and one missing submission so the answer has
    // something real to ground in.
    const [assessment] = await db
      .insert(schema.assessments)
      .values({
        sectionId: section.id,
        title: "Cell Structure Quiz",
        status: "draft",
        dueAt: new Date("2026-10-01T23:59:00.000Z"),
        pointsPossible: "100",
        createdByPersonId: teacher.id,
      })
      .returning();

    const teacherContext = contextFor(teacher.id, [
      "assessment.publish",
      "submission.grade",
    ]);
    await learning.publishAssessment(teacherContext, assessment!.id);

    const [submission] = await db
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.assessmentId, assessment!.id));

    await learning.submitAssessment(
      contextFor(
        (
          await db
            .select({ personId: schema.studentProfiles.personId })
            .from(schema.studentProfiles)
            .where(eq(schema.studentProfiles.id, student.id))
        )[0]!.personId,
        ["submission.submit"],
      ),
      submission!.id,
      { text: "work" },
      new Date("2026-10-01T12:00:00.000Z"),
    );
    await learning.gradeSubmission(teacherContext, submission!.id, {
      score: "78",
      feedback: { comment: "Solid effort." },
    });

    const turn = await agent.sendMessage(guardianContext, {
      body: "How is Bobby doing?",
    });

    expect(turn.runStatus).toBe("completed");
    expect(turn.message.role).toBe("agent");
    expect(turn.message.body).toContain("no missing assignments");
    expect(turn.message.body).toContain("78");
    // Evidence: the graded submission is attached as a verifiable reference.
    expect(turn.message.evidenceRefs).toContainEqual({
      type: "submission",
      id: submission!.id,
      label: "Cell Structure Quiz",
    });

    // The turn is durable and auditable.
    const messages = await agent.getConversationMessages(
      guardian.id,
      turn.conversationId,
    );
    expect(messages.map((m) => m.role)).toEqual(["user", "agent"]);

    const audit = await db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.resourceId, turn.runId));
    expect(audit.map((row) => row.action)).toContain("agent.run");

    // The same question from an unrelated person finds nothing and leaks nothing.
    const outsiderTurn = await agent.sendMessage(contextFor(outsider.id, []), {
      body: "How is Bobby doing?",
    });
    expect(outsiderTurn.runStatus).toBe("completed");
    expect(outsiderTurn.message.body).not.toContain("Bobby");
    expect(outsiderTurn.message.body).not.toContain("78");
    expect(outsiderTurn.message.evidenceRefs).toHaveLength(0);
  });

  it("turns a watch request into a confirmed subscription that then delivers (A1 -> A2)", async () => {
    const { db, schema, teacher, guardian, student, section } = await seedFamily();
    const agent = await import("@/platform/agent");
    const learning = await import("@/modules/learning/missing-work-service");
    const worker = await import("@/workers/domain-event-worker");
    const { and, eq } = await import("drizzle-orm");

    const guardianContext = contextFor(guardian.id, ["student:related-read"]);

    // 1. The parent speaks naturally; the agent prepares a rule and waits.
    const turn = await agent.sendMessage(guardianContext, {
      body: "Tell me when Bobby misses an assignment. Remind me the next day if it's still missing.",
    });

    expect(turn.runStatus).toBe("awaiting_approval");
    expect(turn.message.actionPreview?.tool).toBe("create_watch");
    expect(turn.message.actionPreview?.summary).toContain("Bobby");

    // 2. Nothing exists before confirmation — navigating away changes nothing.
    let watches = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.subscriberPersonId, guardian.id));
    expect(watches).toHaveLength(0);

    // 3. Confirm: the conversation produces a real, durable object.
    const confirmed = await agent.confirmRun(guardianContext, {
      runId: turn.runId,
      approve: true,
    });
    expect(confirmed.runStatus).toBe("completed");

    watches = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.subscriberPersonId, guardian.id));
    expect(watches).toHaveLength(1);
    expect(watches[0]!.createdVia).toBe("conversation");
    expect(watches[0]!.sourceConversationId).toBe(turn.conversationId);
    expect(watches[0]!.subjectId).toBe(student.id);
    expect(watches[0]!.reminderPolicy).toEqual({ remindAfterHours: 24 });

    // 4. The watched event actually fires (GF1 steps) and the watch delivers.
    const [assessment] = await db
      .insert(schema.assessments)
      .values({
        sectionId: section.id,
        title: "Photosynthesis Worksheet",
        status: "draft",
        dueAt: new Date("2026-10-10T23:59:00.000Z"),
        pointsPossible: "100",
        createdByPersonId: teacher.id,
      })
      .returning();

    await learning.publishAssessment(
      contextFor(teacher.id, ["assessment.publish"]),
      assessment!.id,
    );
    await learning.markOverdueSubmissionsMissing(
      new Date("2026-10-11T08:00:00.000Z"),
    );
    await worker.processPendingDomainEvents();

    const deliveries = await db
      .select()
      .from(schema.subscriptionDeliveries)
      .where(eq(schema.subscriptionDeliveries.subscriptionId, watches[0]!.id));
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.status).toBe("delivered");

    // 5. Approval and execution are auditable.
    const audit = await db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.resourceId, turn.runId));
    const actions = audit.map((row) => row.action);
    expect(actions).toContain("agent.run");
    expect(actions).toContain("agent.run.approve");
  });

  it("never executes without approval and never leaks across permissions", async () => {
    const { db, schema, guardian, outsider, student } = await seedFamily();
    const agent = await import("@/platform/agent");
    const { eq } = await import("drizzle-orm");

    const outsiderContext = contextFor(outsider.id, []);

    // An outsider asking to watch Bobby gets a safe refusal, not a preview.
    const refused = await agent.sendMessage(outsiderContext, {
      body: "Tell me when Bobby misses an assignment.",
    });
    expect(refused.runStatus).toBe("completed");
    expect(refused.message.actionPreview).toBeNull();
    expect(refused.message.body).not.toContain("Bobby");

    // A guardian's parked run cannot be approved by someone else.
    const guardianContext = contextFor(guardian.id, ["student:related-read"]);
    const turn = await agent.sendMessage(guardianContext, {
      body: "Tell me when Bobby misses an assignment.",
    });
    expect(turn.runStatus).toBe("awaiting_approval");

    await expect(
      agent.confirmRun(outsiderContext, { runId: turn.runId, approve: true }),
    ).rejects.toThrow();

    // Declining leaves no subscription behind.
    const declined = await agent.confirmRun(guardianContext, {
      runId: turn.runId,
      approve: false,
    });
    expect(declined.runStatus).toBe("cancelled");
    const watches = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.subscriberPersonId, guardian.id));
    expect(watches).toHaveLength(0);

    // Manage: watch appears in the list once created, then revokes via chat.
    const setup = await agent.sendMessage(guardianContext, {
      body: "Tell me when Bobby misses an assignment.",
    });
    await agent.confirmRun(guardianContext, { runId: setup.runId, approve: true });

    const list = await agent.sendMessage(guardianContext, {
      body: "What are you watching for me?",
    });
    expect(list.message.body).toContain("Bobby");

    const revoke = await agent.sendMessage(guardianContext, {
      body: "Turn off that watch.",
    });
    expect(revoke.runStatus).toBe("awaiting_approval");
    await agent.confirmRun(guardianContext, { runId: revoke.runId, approve: true });

    const [final] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.subscriberPersonId, guardian.id));
    expect(final!.status).toBe("revoked");
    expect(final!.subjectId).toBe(student.id);
  });
});

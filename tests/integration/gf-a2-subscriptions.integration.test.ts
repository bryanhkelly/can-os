import { describe, expect, it } from "vitest";

const integration = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * GF-A2 — Ask CAN: Watch (Durable Subscription)
 *
 * Proves a standing instruction ("tell me when Bobby misses an assignment")
 * becomes a durable subscription that delivers over the outbox, re-checks
 * authorization at delivery time, stays idempotent under reprocessing, and
 * fires reminders only while the watched condition still holds.
 */
integration("GF-A2 durable subscriptions", () => {
  it("delivers watched events, suppresses unauthorized subscribers, and gates reminders on current state", async () => {
    const [
      { db },
      schema,
      { eq, and, inArray },
      learning,
      worker,
      subscriptionsPlatform,
    ] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
      import("@/modules/learning/missing-work-service"),
      import("@/workers/domain-event-worker"),
      import("@/platform/subscriptions"),
    ]);

    const suffix = crypto.randomUUID().slice(0, 8);
    const { createAcademicTimeFixture } = await import("./helpers/academic-time");

    const [jurisdiction] = await db
      .insert(schema.jurisdictions)
      .values({ code: `test-${suffix}`, name: "GF-A2 Test" })
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
          legalFirstName: "Bobby",
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

    const teacherContext = {
      actorPersonId: teacher!.id,
      capabilities: new Set(["assessment.publish", "submission.grade"]),
      scope: { sectionIds: [section!.id] },
      requestId: `gfa2-teacher-${suffix}`,
    };

    const studentContext = {
      actorPersonId: studentPerson!.id,
      capabilities: new Set(["submission.submit"]),
      scope: { sectionIds: [section!.id] },
      requestId: `gfa2-student-${suffix}`,
    };

    // --- Standing instructions -------------------------------------------------
    // The guardian's watch (as created via conversation), the student's own
    // watch, and an unrelated person's watch on the same subject.
    const [guardianSub] = await db
      .insert(schema.subscriptions)
      .values({
        subscriberPersonId: guardian!.id,
        eventTypes: ["AssignmentBecameMissing"],
        subjectType: "student_profile",
        subjectId: student!.id,
        reminderPolicy: { remindAfterHours: 1 },
        channel: "in_app",
        createdVia: "conversation",
      })
      .returning();

    await db.insert(schema.subscriptions).values({
      subscriberPersonId: studentPerson!.id,
      eventTypes: ["AssignmentBecameMissing"],
      subjectType: "student_profile",
      subjectId: student!.id,
      channel: "in_app",
    });

    const [outsiderSub] = await db
      .insert(schema.subscriptions)
      .values({
        subscriberPersonId: outsider!.id,
        eventTypes: ["AssignmentBecameMissing"],
        subjectType: "student_profile",
        subjectId: student!.id,
        channel: "in_app",
      })
      .returning();

    // --- GF1 steps 1-5: assignment published, deadline passes, event emitted ---
    const dueAt = new Date("2026-10-10T23:59:00.000Z");
    const [assessment] = await db
      .insert(schema.assessments)
      .values({
        sectionId: section!.id,
        title: `Lab Report ${suffix}`,
        status: "draft",
        dueAt,
        pointsPossible: "100",
        createdByPersonId: teacher!.id,
      })
      .returning();

    await learning.publishAssessment(teacherContext, assessment!.id);
    await learning.markOverdueSubmissionsMissing(
      new Date("2026-10-11T08:00:00.000Z"),
    );

    await worker.processPendingDomainEvents();

    const [event] = await db
      .select()
      .from(schema.domainEvents)
      .where(
        and(
          eq(schema.domainEvents.eventType, "AssignmentBecameMissing"),
          inArray(
            schema.domainEvents.aggregateId,
            (
              await db
                .select({ id: schema.submissions.id })
                .from(schema.submissions)
                .where(eq(schema.submissions.assessmentId, assessment!.id))
            ).map((row) => row.id),
          ),
        ),
      )
      .limit(1);

    expect(event).toBeDefined();
    expect(event.status).toBe("processed");

    const [submission] = await db
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.id, event.aggregateId));

    // --- Delivery: guardian + student delivered, outsider suppressed -----------
    const deliveries = await db
      .select()
      .from(schema.subscriptionDeliveries)
      .where(eq(schema.subscriptionDeliveries.domainEventId, event.id));

    const bySubscription = new Map(
      deliveries.map((row) => [row.subscriptionId, row]),
    );

    const guardianDelivery = bySubscription.get(guardianSub!.id);
    expect(guardianDelivery?.status).toBe("delivered");
    expect(guardianDelivery?.notificationId).toBeTruthy();

    const outsiderDelivery = bySubscription.get(outsiderSub!.id);
    expect(outsiderDelivery?.status).toBe("suppressed");
    expect(outsiderDelivery?.lastError).toBe("authorization_failed");
    expect(outsiderDelivery?.notificationId).toBeNull();

    const [guardianAlert] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, guardianDelivery!.notificationId!));

    expect(guardianAlert.type).toBe("watch_alert");
    expect(guardianAlert.resourceType).toBe("submission");
    expect(guardianAlert.resourceId).toBe(submission!.id);
    expect(guardianAlert.title).toContain("Lab Report");

    // The outsider received no watch alert for this event.
    const outsiderAlerts = await db
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.recipientPersonId, outsider!.id),
          eq(schema.notifications.eventId, event.id),
        ),
      );
    expect(outsiderAlerts).toHaveLength(0);

    // --- Idempotency: reprocessing the event creates no duplicates -------------
    const rerun = await subscriptionsPlatform.processEventSubscriptions(event.id);
    expect(rerun).toBe(0);

    const deliveriesAfterRerun = await db
      .select()
      .from(schema.subscriptionDeliveries)
      .where(eq(schema.subscriptionDeliveries.domainEventId, event.id));
    expect(deliveriesAfterRerun).toHaveLength(deliveries.length);

    // --- Reminder: fires once while the submission is still missing ------------
    // Events carry real wall-clock occurredAt, so the reminder window is
    // evaluated against a simulated future "now".
    const reminderTime = new Date(Date.now() + 2 * 3_600_000);
    const remindersSent =
      await subscriptionsPlatform.processSubscriptionReminders(reminderTime);
    expect(remindersSent).toBeGreaterThanOrEqual(1);

    const [guardianReminder] = await db
      .select()
      .from(schema.subscriptionDeliveries)
      .where(
        and(
          eq(schema.subscriptionDeliveries.subscriptionId, guardianSub!.id),
          eq(schema.subscriptionDeliveries.domainEventId, event.id),
          eq(schema.subscriptionDeliveries.kind, "reminder"),
        ),
      );

    expect(guardianReminder?.status).toBe("delivered");

    const [reminderNotification] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, guardianReminder!.notificationId!));
    expect(reminderNotification.title).toContain("Reminder:");

    // No second reminder for the same subscription+event.
    const remindersAgain =
      await subscriptionsPlatform.processSubscriptionReminders(reminderTime);
    expect(remindersAgain).toBe(0);

    // --- Condition resolved: no reminder for the next watched event ------------
    const [assessmentTwo] = await db
      .insert(schema.assessments)
      .values({
        sectionId: section!.id,
        title: `Quiz ${suffix}`,
        status: "draft",
        dueAt,
        pointsPossible: "50",
        createdByPersonId: teacher!.id,
      })
      .returning();

    await learning.publishAssessment(teacherContext, assessmentTwo!.id);
    await learning.markOverdueSubmissionsMissing(
      new Date("2026-10-11T08:00:00.000Z"),
    );
    await worker.processPendingDomainEvents();

    const [submissionTwo] = await db
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.assessmentId, assessmentTwo!.id));

    const [eventTwo] = await db
      .select()
      .from(schema.domainEvents)
      .where(
        and(
          eq(schema.domainEvents.eventType, "AssignmentBecameMissing"),
          eq(schema.domainEvents.aggregateId, submissionTwo!.id),
        ),
      )
      .limit(1);

    // Student recovers before the reminder window elapses.
    await learning.submitAssessment(
      studentContext,
      submissionTwo!.id,
      { text: "Completed quiz" },
      new Date("2026-10-11T12:00:00.000Z"),
    );

    await subscriptionsPlatform.processSubscriptionReminders(reminderTime);

    const [resolvedReminder] = await db
      .select()
      .from(schema.subscriptionDeliveries)
      .where(
        and(
          eq(schema.subscriptionDeliveries.subscriptionId, guardianSub!.id),
          eq(schema.subscriptionDeliveries.domainEventId, eventTwo!.id),
          eq(schema.subscriptionDeliveries.kind, "reminder"),
        ),
      );

    expect(resolvedReminder?.status).toBe("suppressed");
    expect(resolvedReminder?.lastError).toBe("condition_resolved");

    // --- Revocation: delivery-time re-check suppresses on stale permission -----
    await db
      .update(schema.guardianRelationships)
      .set({ canViewAcademics: false })
      .where(
        and(
          eq(schema.guardianRelationships.guardianPersonId, guardian!.id),
          eq(schema.guardianRelationships.studentPersonId, studentPerson!.id),
        ),
      );

    const [assessmentThree] = await db
      .insert(schema.assessments)
      .values({
        sectionId: section!.id,
        title: `Essay ${suffix}`,
        status: "draft",
        dueAt,
        pointsPossible: "100",
        createdByPersonId: teacher!.id,
      })
      .returning();

    await learning.publishAssessment(teacherContext, assessmentThree!.id);
    await learning.markOverdueSubmissionsMissing(
      new Date("2026-10-11T08:00:00.000Z"),
    );
    await worker.processPendingDomainEvents();

    const [submissionThree] = await db
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.assessmentId, assessmentThree!.id));

    const [eventThree] = await db
      .select()
      .from(schema.domainEvents)
      .where(
        and(
          eq(schema.domainEvents.eventType, "AssignmentBecameMissing"),
          eq(schema.domainEvents.aggregateId, submissionThree!.id),
        ),
      )
      .limit(1);

    const [revokedDelivery] = await db
      .select()
      .from(schema.subscriptionDeliveries)
      .where(
        and(
          eq(schema.subscriptionDeliveries.subscriptionId, guardianSub!.id),
          eq(schema.subscriptionDeliveries.domainEventId, eventThree!.id),
          eq(schema.subscriptionDeliveries.kind, "initial"),
        ),
      );

    expect(revokedDelivery?.status).toBe("suppressed");
    expect(revokedDelivery?.lastError).toBe("authorization_failed");

    // The student's own subscription still delivers — their authorization is intact.
    const studentDeliveries = await db
      .select({ status: schema.subscriptionDeliveries.status })
      .from(schema.subscriptionDeliveries)
      .innerJoin(
        schema.subscriptions,
        eq(schema.subscriptions.id, schema.subscriptionDeliveries.subscriptionId),
      )
      .where(
        and(
          eq(schema.subscriptionDeliveries.domainEventId, eventThree!.id),
          eq(schema.subscriptions.subscriberPersonId, studentPerson!.id),
        ),
      );

    expect(studentDeliveries[0]?.status).toBe("delivered");
  });

  it("backs off failing events and escalates terminal failures to an ops Action", async () => {
    const [{ db }, schema, { eq }, worker] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
      import("@/workers/domain-event-worker"),
    ]);

    // An AssignmentBecameMissing event pointing at a nonexistent submission:
    // the handler loads no context and throws.
    const [event] = await db
      .insert(schema.domainEvents)
      .values({
        eventType: "AssignmentBecameMissing",
        aggregateType: "submission",
        aggregateId: crypto.randomUUID(),
      })
      .returning();

    // First attempt fails and is scheduled for retry with backoff.
    await worker.processPendingDomainEvents();

    let [current] = await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.id, event.id));

    expect(current!.status).toBe("pending");
    expect(current!.attempts).toBe(1);
    expect(current!.lastError).toBeTruthy();
    expect(current!.nextAttemptAt).toBeTruthy();
    expect(current!.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());

    // Backoff gates the retry: an immediate rerun does not reclaim it.
    await worker.processPendingDomainEvents();
    [current] = await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.id, event.id));
    expect(current!.attempts).toBe(1);

    // At the attempt ceiling the event fails terminally and escalates.
    await db
      .update(schema.domainEvents)
      .set({ attempts: 4, nextAttemptAt: null })
      .where(eq(schema.domainEvents.id, event.id));

    await worker.processPendingDomainEvents();

    [current] = await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.id, event.id));

    expect(current!.status).toBe("failed");
    expect(current!.attempts).toBe(5);

    const [escalation] = await db
      .select()
      .from(schema.actions)
      .where(
        eq(schema.actions.subjectId, event.id),
      )
      .limit(1);

    expect(escalation).toBeDefined();
    expect(escalation!.type).toBe("outbox_event_failed");
    expect(escalation!.status).toBe("open");
  });

  it("reclaims expired processing leases and reports outbox health", async () => {
    const [{ db }, schema, { eq }, worker] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
      import("@/workers/domain-event-worker"),
    ]);

    // A crashed worker left this claim leased in the past.
    const [stale] = await db
      .insert(schema.domainEvents)
      .values({
        eventType: "AssignmentBecameMissing",
        aggregateType: "submission",
        aggregateId: crypto.randomUUID(),
        status: "processing",
        nextAttemptAt: new Date(Date.now() - 60_000),
      })
      .returning();

    await worker.processPendingDomainEvents();

    const [reclaimed] = await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.id, stale.id));

    // Reclaimed, retried (handler fails: no such submission), and re-pended.
    expect(["pending", "failed"]).toContain(reclaimed!.status);
    expect(reclaimed!.attempts).toBeGreaterThanOrEqual(1);

    const before = await worker.getOutboxHealth();

    await db.insert(schema.domainEvents).values({
      eventType: `UnregisteredProbe-${crypto.randomUUID().slice(0, 8)}`,
      aggregateType: "probe",
      aggregateId: crypto.randomUUID(),
    });

    const after = await worker.getOutboxHealth();
    expect(after.pendingUnhandled).toBeGreaterThanOrEqual(
      before.pendingUnhandled + 1,
    );
    // The probe row stays: domain_events is append-only by database trigger,
    // and the health metric is asserted as a delta above.
  });
});

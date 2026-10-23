import { describe, expect, it } from "vitest";
import { expectEvidenceFailure, expectMutationEvidence } from "./helpers/mutation-evidence";

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("GF36 co-curriculars and athletics", () => {
  it("tracks consent, physical expiry, fees, versioned eligibility, and canonical calendar events", async () => {
    const [{ db }, schema, { count, eq }, activities] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
      import("@/modules/activities/activity-service"),
    ]);

    const suffix = crypto.randomUUID().slice(0, 8);

    const [jurisdiction] = await db.insert(schema.jurisdictions).values({
      code: `gf36-${suffix}`,
      name: "GF36 Test",
    }).returning();

    const [org] = await db.insert(schema.organizations).values({
      type: "christian_school",
      name: `Athletics School ${suffix}`,
      slug: `athletics-school-${suffix}`,
    }).returning();

    const [site] = await db.insert(schema.sites).values({
      organizationId: org.id,
      name: "Florida Campus",
      slug: `fl-${suffix}`,
      timezone: "America/New_York",
    }).returning();

    const [program] = await db.insert(schema.programs).values({
      organizationId: org.id,
      siteId: site.id,
      jurisdictionId: jurisdiction.id,
      type: "full_school",
      status: "active",
      name: "Athletics Program",
      slug: `athletics-${suffix}`,
      gradeRange: { min: "6", max: "12" },
      deliveryModel: { onsite: true },
      hostOrganizationId: org.id,
      academicProviderOrganizationId: org.id,
      creditIssuingOrganizationId: org.id,
    }).returning();

    const people = await db.insert(schema.people).values([
      { legalFirstName: "Avery", legalLastName: `Student-${suffix}` },
      { legalFirstName: "Pat", legalLastName: `Guardian-${suffix}` },
      { legalFirstName: "Coach", legalLastName: `Advisor-${suffix}` },
    ]).returning();

    const studentPerson = people[0]!;
    const guardian = people[1]!;
    const coach = people[2]!;

    const [student] = await db.insert(schema.studentProfiles).values({
      personId: studentPerson.id,
      gradeLevel: "10",
    }).returning();

    const [household] = await db.insert(schema.households).values({
      displayName: `Athletics Family ${suffix}`,
    }).returning();

    await db.insert(schema.householdMemberships).values([
      {
        householdId: household.id,
        personId: guardian.id,
        relationshipLabel: "guardian",
        isPrimaryContact: true,
      },
      {
        householdId: household.id,
        personId: studentPerson.id,
        relationshipLabel: "student",
        isPrimaryContact: false,
      },
    ]);

    await db.insert(schema.guardianRelationships).values({
      guardianPersonId: guardian.id,
      studentPersonId: studentPerson.id,
      relationshipLabel: "parent",
    });

    const [physical] = await db.insert(schema.documents).values({
      subjectType: "student_profile",
      subjectId: student.id,
      category: "athletic_physical",
      fileName: `physical-${suffix}.pdf`,
      storageProvider: "test",
      storageKey: `physical-${suffix}`,
      mimeType: "application/pdf",
      sensitivityTier: "medical",
      expiresAt: new Date("2028-08-01T00:00:00.000Z"),
      uploadedByPersonId: guardian.id,
    }).returning();

    const staffContext = {
      actorPersonId: coach.id,
      capabilities: new Set([
        "activity.manage",
        "activity.eligibility.evaluate",
        "activity.calendar.manage",
      ]),
      scope: {
        siteIds: [site.id],
        programIds: [program.id],
      },
      requestId: `gf36-staff-${suffix}`,
    };

    for (const writer of ["writeAudit", "emitEvent"] as const) {
      const name = `Rollback activity ${writer}-${suffix}`;
      await expectEvidenceFailure(db, writer, () => activities.createActivity(staffContext, {
        siteId: site.id, programId: program.id, type: "club", name,
      }));
      expect(await db.select().from(schema.activities).where(eq(schema.activities.name, name))).toEqual([]);
    }
    const activityId = await activities.createActivity(staffContext, {
      siteId: site.id,
      programId: program.id,
      type: "athletics",
      name: "Track & Field",
      advisorPersonId: coach.id,
    });

    const seasonInput = {
      activityId,
      name: "Spring 2028",
      startsOn: "2028-01-15",
      endsOn: "2028-05-20",
      feeAmountCents: 15000,
      capacity: 1,
    };
    for (const writer of ["writeAudit", "emitEvent"] as const) {
      await expectEvidenceFailure(db, writer, () => activities.createActivitySeason(staffContext, seasonInput));
      expect(await db.select().from(schema.activitySeasons)
        .where(eq(schema.activitySeasons.activityId, activityId))).toEqual([]);
    }
    const seasonId = await activities.createActivitySeason(staffContext, seasonInput);

    const guardianContext = {
      actorPersonId: guardian.id,
      capabilities: new Set(["activity.register"]),
      scope: {},
      requestId: `gf36-guardian-${suffix}`,
    };

    for (const writer of ["writeAudit", "emitEvent"] as const) {
      await expectEvidenceFailure(db, writer, () => activities.registerForActivity(guardianContext, {
        activitySeasonId: seasonId, studentProfileId: student.id,
        householdId: household.id, consentVersion: "rollback",
      }));
      expect(await db.select().from(schema.activityRegistrations)
        .where(eq(schema.activityRegistrations.activitySeasonId, seasonId))).toEqual([]);
      expect(await db.select().from(schema.consentRecords)
        .where(eq(schema.consentRecords.subjectId, seasonId))).toEqual([]);
      expect(await db.select().from(schema.financialObligations)
        .where(eq(schema.financialObligations.subjectId, seasonId))).toEqual([]);
    }
    const registrationId = await activities.registerForActivity(guardianContext, {
      activitySeasonId: seasonId,
      studentProfileId: student.id,
      householdId: household.id,
      consentVersion: "2028.1",
      physicalDocumentId: physical.id,
      physicalExpiresOn: "2028-08-01",
    });

    const [registration] = await db.select().from(schema.activityRegistrations)
      .where(eq(schema.activityRegistrations.id, registrationId));

    expect(registration.consentRecordId).toBeTruthy();
    expect(registration.physicalDocumentId).toBe(physical.id);
    expect(registration.physicalExpiresOn).toBe("2028-08-01");
    expect(registration.financialObligationId).toBeTruthy();

    const [fee] = await db.select().from(schema.financialObligations)
      .where(eq(schema.financialObligations.id, registration.financialObligationId!));
    expect(fee.amountCents).toBe(15000);

    const [siblingPerson] = await db.insert(schema.people).values({ legalFirstName: "Jordan", legalLastName: `Student-${suffix}` }).returning();
    const [sibling] = await db.insert(schema.studentProfiles).values({ personId: siblingPerson.id, gradeLevel: "9" }).returning();
    await db.insert(schema.guardianRelationships).values({ guardianPersonId: guardian.id, studentPersonId: siblingPerson.id, relationshipLabel: "parent" });
    const siblingRegistrationId = await activities.registerForActivity(guardianContext, {
      activitySeasonId: seasonId, studentProfileId: sibling.id, householdId: household.id, consentVersion: "2028.1",
    });
    const [waitlist] = await db.select().from(schema.activityRegistrations).where(eq(schema.activityRegistrations.id, siblingRegistrationId));
    expect(waitlist.status).toBe("waitlisted");
    expect(waitlist.financialObligationId).toBeNull();

    const check1 = await activities.evaluateActivityEligibility(staffContext, {
      registrationId,
      status: "eligible",
      ruleVersion: "FL-ATH-2028.1",
      evidence: {
        termGpa: 3.1,
        passingCourseCount: 6,
        physicalValidThrough: "2028-08-01",
      },
      validThrough: new Date("2028-03-15T00:00:00.000Z"),
    });

    expect(check1).toBeTruthy();

    const check2 = await activities.evaluateActivityEligibility(staffContext, {
      registrationId,
      status: "conditional",
      ruleVersion: "FL-ATH-2028.2",
      evidence: {
        termGpa: 2.2,
        interventionRequired: true,
      },
      validThrough: new Date("2028-04-15T00:00:00.000Z"),
    });

    expect(check2).not.toBe(check1);

    const checks = await db.select().from(schema.activityEligibilityChecks)
      .where(eq(schema.activityEligibilityChecks.activityRegistrationId, registrationId));
    expect(checks).toHaveLength(2);

    const calendarInput = {
      activitySeasonId: seasonId,
      title: "Track Practice",
      type: "practice" as const,
      startsAt: new Date("2028-02-01T20:00:00.000Z"),
      endsAt: new Date("2028-02-01T22:00:00.000Z"),
    };
    for (const writer of ["writeAudit", "emitEvent"] as const) {
      const beforeOccurrences = await db.select({ total: count() }).from(schema.scheduledOccurrences);
      await expectEvidenceFailure(db, writer, () => activities.addActivityCalendarEvent(staffContext, calendarInput));
      expect(await db.select().from(schema.calendarEvents)
        .where(eq(schema.calendarEvents.sourceId, seasonId))).toEqual([]);
      expect(await db.select({ total: count() }).from(schema.scheduledOccurrences)).toEqual(beforeOccurrences);
    }
    const eventId = await activities.addActivityCalendarEvent(staffContext, calendarInput);

    const [event] = await db.select().from(schema.calendarEvents)
      .where(eq(schema.calendarEvents.id, eventId));
    expect(event.siteId).toBe(site.id);
    expect(event.timezone).toBe("America/New_York");
    expect(event.sourceType).toBe("activity_season");
    expect(event.sourceId).toBe(seasonId);

    await expect(activities.withdrawActivityRegistration({ ...guardianContext, actorPersonId: coach.id }, { registrationId }))
      .rejects.toThrow(/authorized guardian/);
    for (const writer of ["writeAudit", "emitEvent"] as const) {
      await expectEvidenceFailure(db, writer, () => activities.withdrawActivityRegistration(guardianContext, { registrationId }));
      const [unchanged] = await db.select().from(schema.activityRegistrations)
        .where(eq(schema.activityRegistrations.id, registrationId));
      expect(unchanged?.status).toBe("conditional");
    }
    await activities.withdrawActivityRegistration(guardianContext, { registrationId });
    await activities.withdrawActivityRegistration(guardianContext, { registrationId }); // idempotent
    const [withdrawn] = await db.select().from(schema.activityRegistrations)
      .where(eq(schema.activityRegistrations.id, registrationId));
    expect(withdrawn.status).toBe("withdrawn");
    expect(withdrawn.rosterStatus).toBe("not_rostered");
    const scope = { siteId: site.id, programId: program.id };
    for (const [resourceType, resourceId, action, eventType, context] of [
      ["activity", activityId, "activity.create", "ActivityCreated", staffContext],
      ["activity_season", seasonId, "activity.season.create", "ActivitySeasonCreated", staffContext],
      ["activity_registration", registrationId, "activity.registration.create", "ActivityRegistrationCreated", guardianContext],
      ["activity_registration", siblingRegistrationId, "activity.registration.create", "ActivityRegistrationCreated", guardianContext],
      ["activity_registration", registrationId, "activity.registration.withdraw", "ActivityRegistrationWithdrawn", guardianContext],
      ["calendar_event", eventId, "activity.calendar.create", "CalendarEventCreated", staffContext],
    ] as const) {
      await expectMutationEvidence(db, {
        resourceType, resourceId, action, eventType, scope,
        actorPersonId: context.actorPersonId, requestId: context.requestId,
      });
    }
    const registrationAudit = await db.select().from(schema.auditEvents)
      .where(eq(schema.auditEvents.resourceId, registrationId));
    expect(JSON.stringify(registrationAudit)).not.toContain(physical.id);

    // Legacy activity seasons can predate the extended-program policy. Even if
    // they remain in 'registration' status they must not enroll minors when
    // linked to an extended-learning Program, nor create another open season.
    await db.update(schema.programs).set({ type: "summer_enrichment" })
      .where(eq(schema.programs.id, program.id));
    await expect(activities.createActivitySeason(staffContext, {
      ...seasonInput, name: "Unapproved Summer 2028",
    })).rejects.toThrow(/verified season-opening safeguards/);
    await expect(activities.registerForActivity(guardianContext, {
      activitySeasonId: seasonId, studentProfileId: student.id,
      householdId: household.id, consentVersion: "2028-unapproved",
    })).rejects.toThrow(/verified season-opening safeguards/);
    const seasonCount = await db.select().from(schema.activitySeasons)
      .where(eq(schema.activitySeasons.activityId, activityId));
    expect(seasonCount).toHaveLength(1);

    // Noncredit extended-learning planning requests must have an active,
    // named site registrar and must never publish registration implicitly.
    await db.update(schema.programs).set({ creditIssuingOrganizationId: null })
      .where(eq(schema.programs.id, program.id));
    await db.update(schema.activitySeasons).set({ status: "draft" })
      .where(eq(schema.activitySeasons.id, seasonId));
    const [readinessAccount] = await db.insert(schema.accessAccounts).values({
      emailNormalized: `gf36-ready-${suffix}@example.test`,
    }).returning();
    const [readinessGrant] = await db.insert(schema.accountPersonGrants).values({
      accountId: readinessAccount.id, personId: coach.id,
      role: "registrar", organizationId: org.id, siteId: site.id,
      active: true,
    }).returning();
    const readinessContext = {
      role: "registrar",
      accountId: readinessAccount.id,
      sessionId: crypto.randomUUID(), grantId: readinessGrant.id,
      grantSiteId: site.id,
      actorPersonId: coach.id,
      capabilities: new Set(["program.launch.start"]),
      scope: { organizationIds: [org.id], siteIds: [site.id], programIds: [program.id] },
      requestId: `gf36-readiness-${suffix}`,
    };
    const { ensureExtendedReadinessAssignments } = await import(
      "@/modules/activities/extended-learning-readiness-service"
    );
    const assignmentInput = { seasonId, recipientPersonId: coach.id };
    await expect(ensureExtendedReadinessAssignments({
      ...readinessContext, scope: { ...readinessContext.scope,
        siteIds: [crypto.randomUUID()] },
    }, assignmentInput)).rejects.toThrow(/scope/);
    await expect(ensureExtendedReadinessAssignments(readinessContext, {
      seasonId, recipientPersonId: guardian.id,
    })).rejects.toThrow(/verified active registrar/);
    for (const writer of ["writeAudit", "emitEvent"] as const) {
      await expectEvidenceFailure(db, writer, () =>
        ensureExtendedReadinessAssignments(readinessContext, assignmentInput));
      const rolledBack = await db.select().from(schema.actions)
        .where(eq(schema.actions.subjectId, seasonId));
      expect(rolledBack).toEqual([]);
    }
    const assigned = await ensureExtendedReadinessAssignments(readinessContext, assignmentInput);
    expect(assigned.created).toBe(6);
    const replay = await ensureExtendedReadinessAssignments(readinessContext, assignmentInput);
    expect(replay.created).toBe(0);
    const requests = await db.select().from(schema.actions)
      .where(eq(schema.actions.subjectId, seasonId));
    expect(requests).toHaveLength(6);
    expect(requests.every(task => task.status === "open" &&
      task.ownerPersonId === coach.id && task.metadata.reviewState === "evidence_requested")).toBe(true);
    for (const task of requests) {
      await expectMutationEvidence(db, {
        resourceType: "action", resourceId: task.id,
        action: "activity.season.readiness.request", eventType: "ActionCreated",
        scope: { organizationId: org.id, siteId: site.id, programId: program.id },
        actorPersonId: coach.id, requestId: readinessContext.requestId,
      });
    }
    const [unopened] = await db.select({ status: schema.activitySeasons.status })
      .from(schema.activitySeasons).where(eq(schema.activitySeasons.id, seasonId));
    expect(unopened.status).toBe("draft");

    // A regular noncredit after-school timetable reuses the canonical calendar,
    // not an academic Section or a second scheduler.
    await db.insert(schema.accountPersonGrants).values({
      accountId: readinessAccount.id,
      personId: coach.id, role: "teacher",
      organizationId: org.id, siteId: site.id, active: true,
    });
    const { scheduleExtendedSessions } = await import(
      "@/modules/activities/extended-learning-sessions.server"
    );
    const scheduleInput = {
      seasonId, fromDate: "2028-02-07", throughDate: "2028-02-16",
      weekdays: [1,3], startTime: "15:00", endTime: "17:00",
      location: "Homework Room", facilitatorPersonId: coach.id,
    };
    await expect(scheduleExtendedSessions({
      ...readinessContext, scope: { ...readinessContext.scope,
        siteIds: [crypto.randomUUID()] },
    }, scheduleInput)).rejects.toThrow(/authorized season/);
    await expect(scheduleExtendedSessions(readinessContext, {
      ...scheduleInput, facilitatorPersonId: guardian.id,
    })).rejects.toThrow(/verified, active grant/);
    for (const writer of ["writeAudit", "emitEvent"] as const) {
      await expectEvidenceFailure(db, writer, () =>
        scheduleExtendedSessions(readinessContext, scheduleInput));
      const records = await db.select().from(schema.calendarEvents)
        .where(eq(schema.calendarEvents.type, "extended_learning_session"));
      expect(records.filter(item => item.sourceId === seasonId)).toHaveLength(0);
    }
    const saved = await scheduleExtendedSessions(readinessContext, scheduleInput);
    expect(saved).toMatchObject({ created: 4, total: 4, timezone: "America/New_York" });
    const replayed = await scheduleExtendedSessions(readinessContext, scheduleInput);
    expect(replayed.created).toBe(0);
    const sessions = await db.select().from(schema.calendarEvents)
      .where(eq(schema.calendarEvents.type, "extended_learning_session"));
    const ownSessions = sessions.filter(item => item.sourceId === seasonId);
    expect(ownSessions).toHaveLength(4);
    expect(ownSessions[0]?.startsAt.toISOString()).toBe("2028-02-07T20:00:00.000Z");
    expect(ownSessions.every(item => item.metadata.extendedLearningDraft === true)).toBe(true);
    expect(ownSessions.every(item => item.metadata.extendedLearningSession &&
      (item.metadata.extendedLearningSession as { facilitatorPersonId?: string }).facilitatorPersonId === coach.id)).toBe(true);
    await expect(scheduleExtendedSessions(readinessContext, {
      ...scheduleInput, location: "Different Room",
    })).rejects.toThrow(/different details/);
    const [stillDraft] = await db.select({ status: schema.activitySeasons.status })
      .from(schema.activitySeasons).where(eq(schema.activitySeasons.id, seasonId));
    expect(stillDraft.status).toBe("draft");

    // Summer/enrichment family path: publish a real noncredit offer, then reuse
    // consent, household financial obligation, and the locked seat/waitlist allocator.
    const { publishExtendedSeason } = await import(
      "@/modules/activities/enrichment-publication.server"
    );
    const policy = {
      seasonId, permissionVersion: "summer-2028-v1",
      permissionText: "I consent to participation in this supervised summer workshop and understand the site pickup instructions.",
      feeAmountCents: 12500, operationalResponsibilityConfirmed: true as const,
    };
    await expect(publishExtendedSeason({
      ...readinessContext, scope: {
        ...readinessContext.scope, siteIds: [crypto.randomUUID()],
      },
    }, policy)).rejects.toThrow(/authorized extended-learning/);
    for (const writer of ["writeAudit", "emitEvent"] as const) {
      await expectEvidenceFailure(db, writer, () =>
        publishExtendedSeason(readinessContext, policy));
      const [unchanged] = await db.select().from(schema.activitySeasons)
        .where(eq(schema.activitySeasons.id, seasonId));
      expect(unchanged.status).toBe("draft");
    }
    const published = await publishExtendedSeason(readinessContext, policy);
    expect(published).toMatchObject({status: "registration", created:true});
    const repeatPublish = await publishExtendedSeason(readinessContext, policy);
    expect(repeatPublish.created).toBe(false);
    await expect(publishExtendedSeason(readinessContext, {
      ...policy, permissionVersion:"changed-without-revision",
    })).rejects.toThrow(/controlled revision/);
    const [publishedSeason] = await db.select().from(schema.activitySeasons)
      .where(eq(schema.activitySeasons.id, seasonId));
    expect((publishedSeason.metadata.enrichmentPublication as {
      permissionVersion:string
    }).permissionVersion).toBe(policy.permissionVersion);

    // This student has a real GuardianRelationship, but NO school-year/program
    // enrollment. A summer registration must not manufacture one.
    const [outsidePerson] = await db.insert(schema.people).values({
      legalFirstName:"Morgan",legalLastName:`Outside-${suffix}`,
      metadata:{origin:"guardian_enrichment"},
    }).returning();
    const [outsideChild] = await db.insert(schema.studentProfiles).values({
      personId:outsidePerson.id,gradeLevel:"8",
      metadata:{origin:"guardian_enrichment"},
    }).returning();
    await db.insert(schema.guardianRelationships).values({
      guardianPersonId:guardian.id,studentPersonId:outsidePerson.id,
      relationshipLabel:"parent",canManageEnrollment:true,
    });
    await db.insert(schema.householdMemberships).values({
      householdId:household.id,personId:outsidePerson.id,relationshipLabel:"student",
    });

    const enrollmentBefore = await db.select().from(schema.enrollments)
      .where(eq(schema.enrollments.studentProfileId,outsideChild.id));
    expect(enrollmentBefore).toHaveLength(0);
    const request = {
      activitySeasonId:seasonId,studentProfileId:outsideChild.id,
      householdId:household.id,consentVersion:policy.permissionVersion,acknowledged:true,
    };
    await expect(activities.registerForActivity(guardianContext,{
      ...request, acknowledged:false,
    })).rejects.toThrow(/acknowledge/);
    await expect(activities.registerForActivity(guardianContext,{
      ...request, consentVersion:"expired-version",
    })).rejects.toThrow(/acknowledge/);
    await expect(activities.registerForActivity({
      ...guardianContext,actorPersonId:coach.id,
    },request)).rejects.toThrow(/authorized guardian/);

    for (const writer of ["writeAudit", "emitEvent"] as const) {
      await expectEvidenceFailure(db,writer,() =>
        activities.registerForActivity(guardianContext,request));
      const unchanged = await db.select().from(schema.activityRegistrations)
        .where(eq(schema.activityRegistrations.studentProfileId,outsideChild.id));
      expect(unchanged).toHaveLength(0);
    }
    const outsideRegistrationId = await activities.registerForActivity(guardianContext,request);
    const retryId = await activities.registerForActivity(guardianContext,request);
    expect(retryId).toBe(outsideRegistrationId);
    const [outsideRegistration] = await db.select().from(schema.activityRegistrations)
      .where(eq(schema.activityRegistrations.id,outsideRegistrationId));
    expect(outsideRegistration.status).toBe("pending");
    const [outsideConsent] = await db.select().from(schema.consentRecords)
      .where(eq(schema.consentRecords.id,outsideRegistration.consentRecordId!));
    expect(outsideConsent.version).toBe(policy.permissionVersion);
    expect(outsideConsent.signatureEvidence.permissionText).toBe(policy.permissionText);
    const [outsideFee] = await db.select().from(schema.financialObligations)
      .where(eq(schema.financialObligations.id,outsideRegistration.financialObligationId!));
    expect(outsideFee.amountCents).toBe(12500);
    expect(await db.select().from(schema.enrollments)
      .where(eq(schema.enrollments.studentProfileId,outsideChild.id))).toHaveLength(0);

    // Selectable week/day packages share the same season and date-specific
    // seat inventory: two students can book distinct days in a 1-seat program.
    const [packageSeason] = await db.insert(schema.activitySeasons).values({
      activityId, name:"Flexible February 2028",startsOn:"2028-02-21",
      endsOn:"2028-02-23",capacity:1,status:"draft",
    }).returning({id:schema.activitySeasons.id});
    const calendarPackage = await scheduleExtendedSessions(readinessContext, {
      seasonId:packageSeason.id,fromDate:"2028-02-21",throughDate:"2028-02-23",
      weekdays:[1,3],startTime:"15:00",endTime:"17:00",
      location:"Art Studio",facilitatorPersonId:coach.id,
    });
    expect(calendarPackage.created).toBe(2);
    const events = await db.select().from(schema.calendarEvents)
      .where(eq(schema.calendarEvents.sourceId,packageSeason.id));
    expect(events).toHaveLength(2);
    const ordered = events.sort((a,b)=>a.startsAt.getTime()-b.startsAt.getTime());
    const packageA = crypto.randomUUID();
    const packageB = crypto.randomUUID();
    const packageFull = crypto.randomUUID();
    const packages = [
      {id:packageA,title:"Monday",priceCents:4500,sessionIds:[ordered[0]!.id]},
      {id:packageB,title:"Wednesday",priceCents:5500,sessionIds:[ordered[1]!.id]},
      {id:packageFull,title:"Both days",priceCents:9000,
        sessionIds:[ordered[0]!.id,ordered[1]!.id]},
    ];
    await publishExtendedSeason(readinessContext,{
      ...policy,seasonId:packageSeason.id,packages,
    });
    const baseChoice={
      activitySeasonId:packageSeason.id,householdId:household.id,
      consentVersion:policy.permissionVersion,acknowledged:true,
    };
    const mon=await activities.registerForActivity(guardianContext,{
      ...baseChoice,studentProfileId:outsideChild.id,
      selectedPackageIds:[packageA],
    });
    const wed=await activities.registerForActivity(guardianContext,{
      ...baseChoice,studentProfileId:sibling.id,
      selectedPackageIds:[packageB],
    });
    const [mreg]=await db.select().from(schema.activityRegistrations)
      .where(eq(schema.activityRegistrations.id,mon));
    const [wreg]=await db.select().from(schema.activityRegistrations)
      .where(eq(schema.activityRegistrations.id,wed));
    expect(mreg.status).toBe("pending");
    expect(wreg.status).toBe("pending");
    expect(mreg.metadata.enrichmentSelection).toMatchObject({
      packageIds:[packageA],sessionIds:[ordered[0]!.id],amountCents:4500,
    });
    expect(wreg.metadata.enrichmentSelection).toMatchObject({
      packageIds:[packageB],sessionIds:[ordered[1]!.id],amountCents:5500,
    });
    const [mFee]=await db.select().from(schema.financialObligations)
      .where(eq(schema.financialObligations.id,mreg.financialObligationId!));
    const [wFee]=await db.select().from(schema.financialObligations)
      .where(eq(schema.financialObligations.id,wreg.financialObligationId!));
    expect([mFee.amountCents,wFee.amountCents]).toEqual([4500,5500]);
    await expect(activities.registerForActivity(guardianContext,{
      ...baseChoice,studentProfileId:outsideChild.id,
      selectedPackageIds:[packageB],
    })).rejects.toThrow(/different package choices/);
    await expect(activities.registerForActivity(guardianContext,{
      ...baseChoice,studentProfileId:student.id,
      selectedPackageIds:[packageA,packageFull],
    })).rejects.toThrow(/overlapping/);
    const waitlisted=await activities.registerForActivity(guardianContext,{
      ...baseChoice,studentProfileId:student.id,
      selectedPackageIds:[packageFull],
    });
    const [waitReg]=await db.select().from(schema.activityRegistrations)
      .where(eq(schema.activityRegistrations.id,waitlisted));
    expect(waitReg.status).toBe("waitlisted");
    expect(waitReg.financialObligationId).toBeNull();
  });
});

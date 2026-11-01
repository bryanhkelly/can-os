/**
 * Journey C — a complete, safe school day on ONE journey school.
 *
 * Composes the existing GF4 (attendance + parent excuse), GF34 (health
 * office) and GF35 (safety incident) coverage into a single connected day on
 * the same Program/Section/students created by the journey toolkit:
 *
 *   two children arrive and are expected onsite → the authorized site adult
 *   accepts the scheduled supervision duty → attendance is recorded
 *   (present / absent, idempotent replay) → the absent child's guardian is
 *   notified and submits an excuse → the school reviews and approves it →
 *   the present child is mildly injured at recess; the incident is filed,
 *   amended, reviewed by the assigned reviewer, the guardian notified and
 *   the case closed → later the same child visits the health office, is
 *   sent home (guardian notified, checkout recorded) and is cleared to
 *   return → the family authorizes a pickup adult, custody restrictions and
 *   an unknown-adult attempt are handled, an uncollected-child follow-up is
 *   opened and resolved by staff-witnessed verified release → the site
 *   leader reconciles and attests the day.
 *
 * Cross-role denials (unrelated guardian, onsite-role excuse review,
 * non-medical health read, unauthorized incident read, reviewer-identity
 * mismatch, registrar day-review attestation, premature incident closure)
 * prove the day was safe, not just recorded. Everything rolls back; no
 * synthetic school day persists. This spec requires the pickup schema on the
 * isolated FullFlow database and remains unexecuted until run there.
 */
import { expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import {
  createPersona,
  expectJourneyAudit,
  expectJourneyDenied,
  expectJourneyDomainEvent,
  expectJourneyNotification,
  first,
  getRealDb,
  impersonating,
  integration,
  journeyDatabaseGuard,
  launchJourneySchool,
  enrollJourneyFamily,
  runRollbackJourney,
  serviceContext,
} from "./journey";

journeyDatabaseGuard();

const healthCapabilities = [
  "health.manage",
  "health.compliance.manage",
  "medication.authorization.manage",
  "medication.administer",
  "health.visit.manage",
  "health.clearance.manage",
  "health.read",
] as const;

const incidentCapabilities = [
  "incident.file",
  "incident.amend",
  "incident.review.assign",
  "incident.review.complete",
  "incident.notify",
  "incident.close",
  "incident.read",
] as const;

integration("Journey C: a safe school day including verified pickup", () => {
  it("runs arrival, supervision, attendance, an excused exception, an incident, health send-home, verified release and day reconciliation on one school", async () => {
    const { siteDate } = await import("@/domain/expected-attendance");
    const attendance = await import("@/modules/attendance/onsite-attendance-workflow.functions");
    const supervision = await import("@/modules/operations/onsite-supervision.functions");
    const duty = await import("@/modules/operations/onsite-duty-response.functions");
    const health = await import("@/modules/health/health-office-service");
    const incidents = await import("@/modules/incidents/incident-service");
    const dayReview = await import("@/modules/operations/onsite-day-review.functions");
    const siteToday = await import("@/modules/operations/site-today.functions");
    const pickup = await import("@/modules/operations/pickup.functions");

    const timeZone = "America/Los_Angeles";
    const day = siteDate(new Date(), timeZone);
    const weekday = new Date(day + "T12:00:00Z").getUTCDay();
    const yearEnd = siteDate(new Date(Date.now() + 200 * 86400_000), timeZone);
    const suffix = crypto.randomUUID().slice(0, 8);

    const result = await runRollbackJourney(async (journey) => {
      const school = await launchJourneySchool(journey, {
        suffix,
        onsiteSchedule: true,
        time: {
          startsOn: day,
          endsOn: yearEnd,
          termStartsOn: day,
          termEndsOn: yearEnd,
          calendarDays: [{ date: day }],
          scheduleDays: [weekday],
        },
      });

      // Two families complete the entire canonical admissions chain and are
      // placed in the same journey Section.
      const familyA = await enrollJourneyFamily(journey, school, {
        key: "guardian-a",
        studentFirstName: "Avery",
        studentLastName: "Arrives",
        gradeLevel: "9",
      });
      const familyB = await enrollJourneyFamily(journey, school, {
        key: "guardian-b",
        studentFirstName: "Bailey",
        studentLastName: "Absent",
        gradeLevel: "9",
      });

      // ── 1. Expected onsite roster for the school-local day ──────────────
      journey.setActor(school.operatorScoped);
      const roster = await attendance.listExpectedOnsiteRoster({ data: { date: day } });
      const expectedA = roster.students.find(r => r.studentProfileId === familyA.studentProfileId);
      const expectedB = roster.students.find(r => r.studentProfileId === familyB.studentProfileId);
      expect(expectedA?.status).toBe("unmarked");
      expect(expectedB?.status).toBe("unmarked");

      // ── 2. Authorized adult accepts the scheduled supervision duty ──────
      journey.setActor(school.siteLeader.actor);
      const dayContext = await attendance.getOnsiteStaffDayContext();
      expect(dayContext.siteId).toBe(school.site.id);
      const plan = await supervision.getOnsiteSupervisionPlan({ data: { date: day } });
      const block = plan.blocks.find(b => b.sectionId === school.section.id);
      expect(block, "scheduled supervision block for the journey Section").toBeTruthy();
      expect(block!.canRespond).toBe(true);
      expect(block!.canAccept).toBe(true);
      const accepted = await duty.respondToOnsiteDuty({ data: {
        date: day,
        sectionId: school.section.id,
        periodId: block!.periodId!,
        response: "accepted",
        confirmed: true as const,
      } });
      expect(accepted.created).toBe(true);
      // An identical retry against the same plan is a no-op, and a
      // contradictory retry is rejected.
      expect(await duty.respondToOnsiteDuty({ data: {
        date: day,
        sectionId: school.section.id,
        periodId: block!.periodId!,
        response: "accepted",
        confirmed: true as const,
      } })).toMatchObject({ created: false });
      await expectJourneyDenied(duty.respondToOnsiteDuty({ data: {
        date: day,
        sectionId: school.section.id,
        periodId: block!.periodId!,
        response: "cannot_cover",
        reason: "unavailable" as const,
        confirmed: true as const,
      } }), "duty already answered");

      // ── 3. Attendance is recorded (arrival + absence) ───────────────────
      journey.setActor(school.operatorScoped);
      const markA = await attendance.markExpectedOnsiteAttendance({ data: {
        date: day,
        studentProfileId: familyA.studentProfileId,
        programId: school.program.id,
        status: "present",
        mutationId: crypto.randomUUID(),
      } });
      const absentMutationId = crypto.randomUUID();
      const markB = await attendance.markExpectedOnsiteAttendance({ data: {
        date: day,
        studentProfileId: familyB.studentProfileId,
        programId: school.program.id,
        status: "absent",
        mutationId: absentMutationId,
      } });
      // Offline-safe: replaying the same committed mutation returns the same
      // event instead of duplicating it.
      expect(await attendance.markExpectedOnsiteAttendance({ data: {
        date: day,
        studentProfileId: familyB.studentProfileId,
        programId: school.program.id,
        status: "absent",
        mutationId: absentMutationId,
      } })).toEqual({ attendanceEventId: markB.attendanceEventId });
      await expectJourneyDomainEvent(journey.tx, {
        aggregateId: markB.attendanceEventId,
        eventType: "StudentMarkedAbsent",
      });
      await expectJourneyNotification(journey.tx, {
        recipientPersonId: familyB.guardian.person.id,
        type: "student_absent",
      });

      // ── 4. Exception: guardian excuse, school review, excused state ──────
      journey.setActor(familyB.guardian.actor);
      const absences = await attendance.listGuardianEffectiveAbsences({ data: {} });
      const absence = first(absences.absences.filter(
        a => a.studentPersonId === familyB.studentPersonId));
      expect(absence.status).toBe("absent");
      const excuse = await attendance.submitEffectiveAttendanceExcuse({ data: {
        attendanceEventId: absence.attendanceEventId,
        reason: "Bailey had a verified medical appointment this morning.",
      } });

      // An unrelated guardian cannot excuse another family's child.
      const outsider = await createPersona(journey.tx, {
        key: "outsider", role: "guardian", organizationId: school.school.id,
        siteId: school.site.id, firstName: "Unrelated", lastName: "Guardian",
        suffix, programIds: [school.program.id],
      });
      journey.setActor(impersonating(familyB.guardian.actor, outsider.person.id));
      await expectJourneyDenied(attendance.submitEffectiveAttendanceExcuse({ data: {
        attendanceEventId: absence.attendanceEventId,
        reason: "An unrelated adult attempts to excuse Bailey.",
      } }), "guardian cannot excuse this student");

      // Onsite duty staff record attendance but never adjudicate excuses.
      journey.setActor(school.siteLeader.actor);
      await expectJourneyDenied(attendance.listExpectedPendingExcuses(),
        "onsite staff cannot review attendance excuses");

      journey.setActor(school.operatorScoped);
      const queue = await attendance.listExpectedPendingExcuses();
      const pending = first(queue.excuses.filter(e => e.excuseId === excuse.excuseId));
      expect(pending.canReview).toBe(true);
      await attendance.reviewCurrentAttendanceExcuse({ data: {
        excuseId: excuse.excuseId,
        decision: "approved",
        note: "Verified appointment documentation on file.",
      } });
      await expectJourneyDomainEvent(journey.tx, {
        aggregateId: excuse.excuseId,
        eventType: "AttendanceExcuseApproved",
      });

      journey.setActor(familyB.guardian.actor);
      const resolved = await attendance.listGuardianEffectiveAbsences({ data: {} });
      expect(first(resolved.absences.filter(
        a => a.studentPersonId === familyB.studentPersonId)).status).toBe("excused");

      // ── 5. Safety incident on a child who was actually present ──────────
      // Avery attended morning recess; Bailey was absent all day, so the
      // incident names Avery — an absent child cannot be injured onsite.
      const reporter = serviceContext(school.siteLeader, incidentCapabilities,
        `journey-c-incident-${suffix}`);
      const incidentId = await incidents.fileIncident(reporter, {
        incidentNumber: `INC-${suffix}`,
        type: "student_injury",
        severity: "moderate",
        occurredAt: new Date(),
        siteId: school.site.id,
        programId: school.program.id,
        locationText: "Playground",
        summary: "Student scraped a knee during morning recess.",
        immediateActions: "First aid provided; guardian contacted by phone.",
        people: [{ personId: familyA.studentPersonId, role: "subject" }],
      });
      await incidents.amendIncident(reporter, {
        incidentId,
        field: "locationText",
        value: "Playground north fence",
        reason: "Witness clarified the exact location.",
      });
      const reviewId = await incidents.assignIncidentReview(reporter, {
        incidentId,
        reviewerPersonId: school.operator.person.id,
        level: "site",
      });
      // Closure is blocked while an assigned review is pending.
      await expectJourneyDenied(incidents.closeIncident(reporter, {
        incidentId,
        closureNote: "Premature closure attempt.",
      }), "reviews must be complete");
      // Only the assigned reviewer may complete the review — the filing site
      // leader cannot self-close a review assigned to the registrar.
      await expectJourneyDenied(incidents.completeIncidentReview(reporter, {
        reviewId,
        decision: "reviewed",
        notes: "Attempted by the filer, not the assigned reviewer.",
      }), "Only the assigned reviewer may complete this review");
      const reviewerContext = serviceContext(
        { ...school.operator, actor: school.operatorScoped },
        ["incident.review.complete"],
        `journey-c-review-${suffix}`);
      await incidents.completeIncidentReview(reviewerContext, {
        reviewId,
        decision: "reviewed",
        notes: "Site review complete; no further follow-up required.",
      });
      await incidents.queueIncidentNotification(reporter, {
        incidentId,
        recipientPersonId: familyA.guardian.person.id,
        recipientType: "guardian",
        recipientLabel: "Family guardian",
        channel: "in_app",
        purpose: "Guardian injury notification",
      });
      await incidents.closeIncident(reporter, {
        incidentId,
        closureNote: "Reviewed and guardian notified.",
      });
      const incidentCase = await incidents.getIncidentCase(reporter, incidentId);
      expect(incidentCase.incident.status).toBe("closed");
      expect(incidentCase.amendments).toHaveLength(1);
      expect(incidentCase.reviews).toHaveLength(1);
      expect(incidentCase.notifications).toHaveLength(1);
      await expectJourneyDomainEvent(journey.tx, {
        aggregateId: incidentId,
        eventType: "IncidentClosed",
      });

      // Restricted incident reads are not implied by teaching authority.
      await expectJourneyDenied(
        incidents.getIncidentCase(serviceContext(school.teacher, [], `journey-c-${suffix}`),
          incidentId));

      // ── 6. Health office visit, recorded checkout, return clearance ──────
      // Later the same day Avery feels ill, is sent home and is cleared to
      // return. Health checkout remains medical disposition evidence; the
      // separate verified custody handoff is asserted below.
      const nurse = await createPersona(journey.tx, {
        key: "nurse", role: "site_staff", organizationId: school.school.id,
        siteId: school.site.id, firstName: "Journey", lastName: "Nurse",
        suffix, programIds: [school.program.id],
      });
      const nurseContext = serviceContext(nurse, healthCapabilities, `journey-c-health-${suffix}`);
      await health.ensureHealthProfile(nurseContext, familyA.studentProfileId);
      await health.setHealthCompliance(nurseContext, {
        studentProfileId: familyA.studentProfileId,
        type: "immunization",
        status: "compliant",
        expiresOn: yearEnd,
        notes: "Reviewed synthetic immunization record.",
      });
      const medicationAuthorizationId = await health.createMedicationAuthorization(nurseContext, {
        studentProfileId: familyA.studentProfileId,
        medicationName: "Rescue Medication",
        instructions: "Administer per approved plan.",
        startsOn: day,
        expiresOn: yearEnd,
        emergencyOnly: true,
      });
      const administrationId = await health.administerMedication(nurseContext, {
        authorizationId: medicationAuthorizationId,
        siteId: school.site.id,
        dose: "1 dose",
        administeredAt: new Date(),
      });
      await expectJourneyDomainEvent(journey.tx, {
        aggregateId: administrationId,
        eventType: "MedicationAdministered",
      });

      const visit = await health.recordHealthOfficeVisit(nurseContext, {
        studentProfileId: familyA.studentProfileId,
        siteId: school.site.id,
        reason: "Headache and nausea after lunch.",
        sentHome: true,
        requireReturnClearance: true,
        notes: "Guardian collected Avery from the health office.",
      });
      expect(visit.returnClearanceId).toBeTruthy();
      // Durable checkout evidence: the named health officer, the sent-home
      // disposition and the checkout timestamp persisted on the visit row.
      const visitRow = first(await journey.tx.select().from(s.healthOfficeVisits)
        .where(eq(s.healthOfficeVisits.id, visit.visitId)));
      expect(visitRow.sentHome).toBe(true);
      expect(visitRow.checkedOutAt).toBeTruthy();
      expect(visitRow.handledByPersonId).toBe(nurse.person.id);
      await expectJourneyNotification(journey.tx, {
        recipientPersonId: familyA.guardian.person.id,
        type: "student_sent_home_ill",
      });

      // Medical-tier reads are not implied by ordinary teaching authority.
      await expectJourneyDenied(
        health.getHealthCase(serviceContext(school.teacher, [], `journey-c-${suffix}`),
          familyA.studentProfileId));

      await health.clearReturnToSchool(nurseContext, {
        clearanceId: visit.returnClearanceId!,
        notes: "Cleared per guardian-provided clinician note.",
      });
      await expectJourneyDomainEvent(journey.tx, {
        aggregateId: visit.returnClearanceId!,
        eventType: "ReturnToSchoolCleared",
      });

      // ── 7. Verified custody release and unauthorized denial ─────────────
      const familyApplication = first(await journey.tx.select({
        householdId: s.applications.householdId,
      }).from(s.applications).where(eq(s.applications.id, familyA.applicationId)));
      journey.setActor(familyA.guardian.actor);
      const authorizationInput = {
        studentProfileId: familyA.studentProfileId,
        programId: school.program.id,
        householdId: familyApplication.householdId,
        legalFirstName: "Morgan",
        legalLastName: "Authorized",
        relationshipLabel: "grandparent",
        identityVerificationMethod: "government_photo_id",
        startsOn: day,
        expiresOn: null,
        mutationId: crypto.randomUUID(),
      } as const;
      const authorization = await pickup.createPickupAuthorization({ data: authorizationInput });
      expect(authorization.created).toBe(true);
      expect(await pickup.createPickupAuthorization({ data: authorizationInput }))
        .toMatchObject({ authorizationId: authorization.authorizationId, created: false });

      // A same-Site guardian account without the verified child relationship
      // cannot create release authority for this Household.
      journey.setActor(impersonating(familyA.guardian.actor, outsider.person.id));
      await expectJourneyDenied(pickup.createPickupAuthorization({ data: {
        ...authorizationInput,
        mutationId: crypto.randomUUID(),
      } }), "verified guardian");

      // A disputed-custody report immediately blocks an otherwise valid adult.
      journey.setActor(familyA.guardian.actor);
      const hold = await pickup.createPickupCustodyHold({ data: {
        studentProfileId: familyA.studentProfileId,
        programId: school.program.id,
        householdId: familyApplication.householdId,
        kind: "disputed_custody",
        reason: "Family reports a custody dispute requiring school review.",
        mutationId: crypto.randomUUID(),
      } });
      journey.setActor(school.siteLeader.actor);
      const releaseInput = {
        date: day,
        studentProfileId: familyA.studentProfileId,
        programId: school.program.id,
        authorizationId: authorization.authorizationId,
        identityVerified: true as const,
        identityVerificationMethod: "government_photo_id" as const,
        verifiedLegalName: "Morgan Authorized",
        handoffEvidence: "Matched government photo ID and personally witnessed the handoff.",
        confirmedHandoff: true as const,
        mutationId: crypto.randomUUID(),
      };
      await expectJourneyDenied(pickup.recordVerifiedPickupRelease({ data: {
        ...releaseInput,
        mutationId: crypto.randomUUID(),
      } }), "custody dispute");
      await pickup.resolvePickupCustodyHold({ data: {
        holdId: hold.holdId,
        resolutionNote: "Site leader reviewed the dispute and documented permission to proceed.",
        mutationId: crypto.randomUUID(),
      } });

      // An unknown adult is explicitly denied; the child remains supervised.
      const denial = await pickup.recordDeniedPickup({ data: {
        date: day,
        studentProfileId: familyA.studentProfileId,
        programId: school.program.id,
        householdId: familyApplication.householdId,
        presentedName: "Unverified Unknown Adult",
        reason: "not_authorized",
        identityVerified: false,
        mutationId: crypto.randomUUID(),
      } });
      await expectJourneyDomainEvent(journey.tx, {
        aggregateId: denial.denialId,
        eventType: "ChildPickupDenied",
      });

      // Dismissal without release creates canonical supervised follow-up.
      const uncollected = await pickup.recordUncollectedChild({ data: {
        date: day,
        studentProfileId: familyA.studentProfileId,
        programId: school.program.id,
        dismissalConfirmed: true,
        followUpPlan: "Keep Avery with the site leader and call the verified family guardian.",
        mutationId: crypto.randomUUID(),
      } });
      await expectJourneyDomainEvent(journey.tx, {
        aggregateId: uncollected.actionId,
        eventType: "ChildUncollectedFollowUpCreated",
      });
      // A second staff device or page retry with a NEW request ID cannot
      // manufacture another open dismissal action for the same child and day.
      await expectJourneyDenied(pickup.recordUncollectedChild({ data: {
        date: day,
        studentProfileId: familyA.studentProfileId,
        programId: school.program.id,
        dismissalConfirmed: true,
        followUpPlan: "Keep the child supervised and contact the authorized family guardian.",
        mutationId: crypto.randomUUID(),
      } }), "already exists");

      // A matching authorization is not enough when the credential name and
      // required verification method do not match the person at pickup.
      await expectJourneyDenied(pickup.recordVerifiedPickupRelease({ data: {
        ...releaseInput,
        verifiedLegalName: "Someone Else",
        mutationId: crypto.randomUUID(),
      } }), "identity not verified");
      const released = await pickup.recordVerifiedPickupRelease({ data: releaseInput });
      expect(released.created).toBe(true);
      await expectJourneyDomainEvent(journey.tx, {
        aggregateId: uncollected.actionId, eventType: "ActionResolved",
      });
      expect(await pickup.recordVerifiedPickupRelease({ data: releaseInput }))
        .toEqual({ releaseId: released.releaseId, created: false });
      const releaseRow = first(await journey.tx.select().from(s.pickupReleaseEvents)
        .where(eq(s.pickupReleaseEvents.id, released.releaseId)));
      expect(releaseRow).toMatchObject({
        studentProfileId: familyA.studentProfileId,
        attendanceEventId: markA.attendanceEventId,
        pickupAuthorizationId: authorization.authorizationId,
        staffWitnessPersonId: school.siteLeader.person.id,
        status: "released",
        identityVerified: true,
        handoffEvidence: releaseInput.handoffEvidence,
      });
      expect(releaseRow.occurredAt).toBeTruthy();
      await expectJourneyDomainEvent(journey.tx, {
        aggregateId: released.releaseId,
        eventType: "ChildReleaseVerified",
      });
      await expectJourneyAudit(journey.tx, {
        resourceId: released.releaseId,
        action: "pickup.release.verified",
      });
      await expectJourneyNotification(journey.tx, {
        recipientPersonId: familyA.guardian.person.id,
        type: "child_release_verified",
      });
      const resolvedFollowUp = first(await journey.tx.select().from(s.actions)
        .where(eq(s.actions.id, uncollected.actionId)));
      expect(resolvedFollowUp.status).toBe("resolved");
      const releasedRoster = await pickup.getOnsitePickupRoster({ data: { date: day } });
      expect(releasedRoster.students.find(row =>
        row.studentProfileId === familyA.studentProfileId)?.release?.id).toBe(released.releaseId);

      // ── 8. The day is reconciled and attested ────────────────────────────
      // A registrar cannot impersonate a site-bound onsite leader. The
      // onsite scope guard denies this actor before the site-leader-only
      // attestation branch is reached.
      journey.setActor(school.operatorScoped);
      await expectJourneyDenied(dayReview.attestOnsiteDayReview({ data: {
        date: day,
        confirmedRecordsReviewed: true,
      } }), "active site-bound onsite attendance assignment");

      journey.setActor(school.siteLeader.actor);
      const before = await dayReview.getOnsiteDayReview({ data: { date: day } });
      expect(before.readyForAttendanceReview).toBe(true);
      expect(before.status).toBe("not_reviewed");
      expect(before.schoolDay.students.find(row=>
        row.studentProfileId===familyA.studentProfileId)).toMatchObject({
        status:"present",healthVisitCount:1,incidentCount:1,
        release:{id:released.releaseId},dismissalStatus:"released",
        deniedPickupAttempts:1,activeEmergencyHold:false,activeCustodyHold:false,
      });
      expect(before.schoolDay.students.find(row=>
        row.studentProfileId===familyB.studentProfileId)).toMatchObject({
        status:"excused",guardianExplanationStatus:"approved",dismissalStatus:"not_present",
      });
      expect(before.schoolDay.staffing.blocks.find(row=>
        row.sectionId===school.section.id)).toMatchObject({
        dutyStatus:"accepted",substitution:false,
      });
      expect(before.schoolDay.exceptions).toMatchObject({
        healthVisits:1,sentHome:1,incidents:1,openIncidents:0,
        emergencyHolds:0,deniedPickupAttempts:1,uncollectedFollowUps:0,
      });
      const attested = await dayReview.attestOnsiteDayReview({ data: {
        date: day,
        confirmedRecordsReviewed: true,
      } });
      expect(attested.created).toBe(true);
      // Identical re-attestation of the same snapshot is idempotent.
      expect(await dayReview.attestOnsiteDayReview({ data: {
        date: day,
        confirmedRecordsReviewed: true,
      } })).toEqual({ reviewId: attested.reviewId, created: false });
      const after = await dayReview.getOnsiteDayReview({ data: { date: day } });
      expect(after.status).toBe("reviewed_snapshot");
      expect(after.custody).toMatchObject({
        presentEntries: 1,
        releasedEntries: 1,
        pendingReleaseEntries: 0,
        deniedAttempts: 1,
        uncollectedFollowUps: 0,
      });
      await expectJourneyAudit(journey.tx, {
        resourceId: attested.reviewId,
        action: "onsite.attendance_day.reviewed",
      });

      // The reconciled roster reflects the whole day: arrival, excused
      // absence, and both students accounted for. Release does not rewrite
      // the historical attendance mark; it links separate custody evidence.
      const finalRoster = await attendance.listExpectedOnsiteRoster({ data: { date: day } });
      expect(finalRoster.students.find(
        r => r.studentProfileId === familyA.studentProfileId)?.status).toBe("present");
      expect(finalRoster.students.find(
        r => r.studentProfileId === familyB.studentProfileId)?.status).toBe("excused");

      // A separate virtual-learning occurrence neither changes the physical
      // onsite roster nor stales the physical school-day source fingerprint.
      await journey.tx.insert(s.attendanceEvents).values({
        studentProfileId:familyA.studentProfileId,programId:school.program.id,
        siteId:school.site.id,sectionId:school.section.id,
        occurrenceKey:day+":virtual-learning",status:"present",
        expectedAt:new Date(),recordedByPersonId:school.siteLeader.person.id,
        sourceKey:`journey-c-virtual-learning-${suffix}`,
      });
      expect((await dayReview.getOnsiteDayReview({data:{date:day}})).status)
        .toBe("reviewed_snapshot");

      // Registrar and Site leader read the same canonical day from Site Today;
      // only the onsite leader receives the operational workspace handoff.
      journey.setActor(school.operatorScoped);
      const registrarToday=await siteToday.getSiteToday({data:{siteId:school.site.id}});
      expect(registrarToday.canOpenOnsiteDay).toBe(false);
      expect(registrarToday.attendance).toMatchObject({count:2,present:1,absent:0,tardy:0});
      expect(registrarToday.schoolDay.students).toHaveLength(2);
      expect(registrarToday.schoolDay.exceptions).toMatchObject({
        healthVisits:1,incidents:1,deniedPickupAttempts:1,
      });
      journey.setActor(outsider.actor);
      await expectJourneyDenied(siteToday.getSiteToday({data:{siteId:school.site.id}}),
        "site.today.read");
      journey.setActor(school.siteLeader.actor);
      const leaderToday=await siteToday.getSiteToday({data:{siteId:school.site.id}});
      expect(leaderToday.canOpenOnsiteDay).toBe(true);
      expect(leaderToday.schoolDay.students.find(row=>
        row.studentProfileId===familyA.studentProfileId)?.release?.id).toBe(released.releaseId);

      // Canonical health evidence added after attestation makes the old review
      // stale without an independent reconciliation checkbox or status write.
      await health.recordHealthOfficeVisit(nurseContext,{
        studentProfileId:familyA.studentProfileId,siteId:school.site.id,
        reason:"Post-review source fingerprint verification.",sentHome:false,
      });
      expect((await dayReview.getOnsiteDayReview({data:{date:day}})).status)
        .toBe("stale_after_changes");

      return {
        programId: school.program.id,
        markA: markA.attendanceEventId,
        markB: markB.attendanceEventId,
        excuseId: excuse.excuseId,
        incidentId,
        visitId: visit.visitId,
        releaseId: released.releaseId,
      };
    });

    // Rollback isolation: no synthetic school-day fact persisted. These
    // checks run after the transaction has ended, so they must use the real
    // client — the mocked one refuses access outside the journey transaction.
    const realDb = await getRealDb();
    expect(await realDb.select({ id: s.programs.id }).from(s.programs)
      .where(eq(s.programs.id, result.programId))).toHaveLength(0);
    expect(await realDb.select({ id: s.attendanceEvents.id }).from(s.attendanceEvents)
      .where(eq(s.attendanceEvents.id, result.markA))).toHaveLength(0);
    expect(await realDb.select({ id: s.incidents.id }).from(s.incidents)
      .where(eq(s.incidents.id, result.incidentId))).toHaveLength(0);
    expect(await realDb.select({ id: s.pickupReleaseEvents.id }).from(s.pickupReleaseEvents)
      .where(eq(s.pickupReleaseEvents.id, result.releaseId))).toHaveLength(0);
  }, 120_000);
});

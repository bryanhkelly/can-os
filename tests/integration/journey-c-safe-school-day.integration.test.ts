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
 *   the arriving child visits the health office, is sent home (guardian
 *   notified, discharge recorded) and is later cleared to return → a safety
 *   incident is filed, amended, reviewed, the guardian notified and the case
 *   closed → the site leader reconciles and attests the day.
 *
 * Cross-role denials (unrelated guardian, onsite-role excuse review,
 * non-medical health read, unauthorized incident read, registrar day-review
 * attestation, premature incident closure) prove the day was safe, not just
 * recorded. Everything rolls back; no synthetic school day persists.
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

integration("Journey C: a complete, safe school day (GF4 + GF34 + GF35)", () => {
  it("runs arrival, supervision, attendance, an excused exception, health send-home, an incident and day reconciliation on one school", async () => {
    const { siteDate } = await import("@/domain/expected-attendance");
    const attendance = await import("@/modules/attendance/onsite-attendance-workflow.functions");
    const supervision = await import("@/modules/operations/onsite-supervision.functions");
    const duty = await import("@/modules/operations/onsite-duty-response.functions");
    const health = await import("@/modules/health/health-office-service");
    const incidents = await import("@/modules/incidents/incident-service");
    const dayReview = await import("@/modules/operations/onsite-day-review.functions");

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
      } });
      expect(accepted.created).toBe(true);
      // An identical retry against the same plan is a no-op, and a
      // contradictory retry is rejected.
      expect(await duty.respondToOnsiteDuty({ data: {
        date: day,
        sectionId: school.section.id,
        periodId: block!.periodId!,
        response: "accepted",
      } })).toMatchObject({ created: false });
      await expectJourneyDenied(duty.respondToOnsiteDuty({ data: {
        date: day,
        sectionId: school.section.id,
        periodId: block!.periodId!,
        response: "cannot_cover",
        reason: "Illness coverage conflict reported for acceptance testing.",
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

      // ── 5. Health office visit, authorized pickup, return clearance ──────
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

      // ── 6. Safety incident lifecycle ─────────────────────────────────────
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
        summary: "Student scraped a knee during recess.",
        immediateActions: "First aid provided; guardian contacted by phone.",
        people: [{ personId: familyB.studentPersonId, role: "subject" }],
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
      await incidents.completeIncidentReview(reporter, {
        reviewId,
        decision: "reviewed",
        notes: "Site review complete; no further follow-up required.",
      });
      await incidents.queueIncidentNotification(reporter, {
        incidentId,
        recipientPersonId: familyB.guardian.person.id,
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

      // ── 7. The day is reconciled and attested ────────────────────────────
      journey.setActor(school.operatorScoped);
      await expectJourneyDenied(dayReview.attestOnsiteDayReview({ data: {
        date: day,
        confirmedRecordsReviewed: true,
      } }), "site leader attendance review authority");

      journey.setActor(school.siteLeader.actor);
      const before = await dayReview.getOnsiteDayReview({ data: { date: day } });
      expect(before.readyForAttendanceReview).toBe(true);
      expect(before.status).toBe("not_reviewed");
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
      await expectJourneyAudit(journey.tx, {
        resourceId: attested.reviewId,
        action: "onsite.attendance_day.reviewed",
      });

      // The reconciled roster reflects the whole day: arrival, excused
      // absence, and both students accounted for.
      const finalRoster = await attendance.listExpectedOnsiteRoster({ data: { date: day } });
      expect(finalRoster.students.find(
        r => r.studentProfileId === familyA.studentProfileId)?.status).toBe("present");
      expect(finalRoster.students.find(
        r => r.studentProfileId === familyB.studentProfileId)?.status).toBe("excused");

      return {
        programId: school.program.id,
        markA: markA.attendanceEventId,
        markB: markB.attendanceEventId,
        excuseId: excuse.excuseId,
        incidentId,
        visitId: visit.visitId,
      };
    });

    // Rollback isolation: no synthetic school-day fact persisted.
    const { db: realDb } = await import("@/db/client");
    expect(await realDb.select({ id: s.programs.id }).from(s.programs)
      .where(eq(s.programs.id, result.programId))).toHaveLength(0);
    expect(await realDb.select({ id: s.attendanceEvents.id }).from(s.attendanceEvents)
      .where(eq(s.attendanceEvents.id, result.markA))).toHaveLength(0);
    expect(await realDb.select({ id: s.incidents.id }).from(s.incidents)
      .where(eq(s.incidents.id, result.incidentId))).toHaveLength(0);
  }, 120_000);
});

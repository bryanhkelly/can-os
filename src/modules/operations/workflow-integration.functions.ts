import { createServerFn } from "@tanstack/react-start";
import { effectiveAttendanceEvents } from "@/domain/effective-attendance";
import { getRequest } from "@tanstack/react-start/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  actions, admissionOffers, applications, assessments, attendanceEvents,
  attendanceExcuses, enrollments, journeyRequirements, journeys, programs,
  schoolYears, sections, submissions,
} from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";

/**
 * Phase 2 canonical cross-workflow projection. This is deliberately read-only:
 * the existing domain services own state changes and audit/event emission.
 * A fixture and an authentic record with identical domain facts project alike.
 */
export const getWorkflowIntegration = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await getCommandContext(getRequest());
  assertCapability(actor, "program.read");
  if (actor.role !== "registrar" || !actor.actorPersonId) {
    throw new AuthorizationError("registrar workflow integration");
  }
  // Do not substitute organization membership for a verified program grant.
  const permittedIds = actor.scope.programIds ?? [];
  const organizationIds = actor.scope.organizationIds ?? [];
  if (!permittedIds.length || !organizationIds.length) return { programs: [], windowDays: 30 };

  const programRows = await db.select({
    id: programs.id, name: programs.name, type: programs.type, status: programs.status,
    siteId: programs.siteId, organizationId: programs.organizationId,
  }).from(programs).where(and(
    inArray(programs.id, permittedIds),
    inArray(programs.organizationId, organizationIds),
  )).orderBy(programs.name);

  if (!programRows.length) return { programs: [], windowDays: 30 };
  const ids = programRows.map(p => p.id);
  const siteIds = [...new Set(programRows.map(p => p.siteId).filter((id): id is string => !!id))];
  const since = new Date(Date.now() - 30 * 86400000);

  const [
    yearRows, sectionRows, launchJourneys, launchRequirements,
    applicationRows, offerRows, enrollmentRows, actionRows, assessmentRows,
    attendanceRows, excuseRows,
  ] = await Promise.all([
    siteIds.length ? db.select({
      id: schoolYears.id, siteId: schoolYears.siteId, organizationId: schoolYears.organizationId,
      programId: schoolYears.programId, status: schoolYears.status,
    }).from(schoolYears).where(inArray(schoolYears.siteId, siteIds)) : Promise.resolve([]),
    db.select({ id: sections.id, programId: sections.programId, active: sections.active })
      .from(sections).where(inArray(sections.programId, ids)),
    db.select({
      id: journeys.id, programId: journeys.programId, participantId: journeys.participantId,
      status: journeys.status,
    }).from(journeys).where(and(
      eq(journeys.participantType, "program"), inArray(journeys.participantId, ids),
    )),
    db.select({
      programId: journeys.participantId, status: journeyRequirements.status,
      blocking: journeyRequirements.blocking,
    }).from(journeyRequirements).innerJoin(journeys, eq(journeys.id, journeyRequirements.journeyId))
      .where(and(eq(journeys.participantType, "program"), inArray(journeys.participantId, ids))),
    db.select({
      id: applications.id, programId: applications.programId,
      studentProfileId: applications.studentProfileId, stage: applications.stage,
    }).from(applications).where(inArray(applications.programId, ids)),
    db.select({ programId: admissionOffers.programId, applicationId: admissionOffers.applicationId,
      schoolYearId: admissionOffers.schoolYearId, status: admissionOffers.status })
      .from(admissionOffers).where(inArray(admissionOffers.programId, ids)),
    db.select({
      programId: enrollments.programId, studentProfileId: enrollments.studentProfileId,
      schoolYearId: enrollments.schoolYearId, kind: enrollments.kind, status: enrollments.status,
    }).from(enrollments).where(and(
      inArray(enrollments.programId, ids), eq(enrollments.kind, "program"),
      eq(enrollments.status, "active"),
    )),
    db.select({ programId: actions.programId, status: actions.status })
      .from(actions).where(and(
        inArray(actions.programId, ids),
        inArray(actions.status, ["open", "in_progress", "waiting"]),
      )),
    db.select({ id: assessments.id, programId: sections.programId })
      .from(assessments).innerJoin(sections, eq(sections.id, assessments.sectionId))
      .where(and(inArray(sections.programId, ids), inArray(assessments.status, ["published", "closed"]))),
    db.select({
      id: attendanceEvents.id, programId: attendanceEvents.programId,
      studentProfileId: attendanceEvents.studentProfileId,
      occurrenceKey: attendanceEvents.occurrenceKey, status: attendanceEvents.status,
      recordedAt: attendanceEvents.recordedAt,
    }).from(attendanceEvents).where(and(
      inArray(attendanceEvents.programId, ids), gte(attendanceEvents.expectedAt, since),
    )).orderBy(desc(attendanceEvents.recordedAt), desc(attendanceEvents.id)),
    db.select({
      programId: attendanceEvents.programId, id: attendanceExcuses.id,
    }).from(attendanceExcuses)
      .innerJoin(attendanceEvents, eq(attendanceEvents.id, attendanceExcuses.attendanceEventId))
      .where(and(
        inArray(attendanceEvents.programId, ids), eq(attendanceExcuses.status, "submitted"),
      )),
  ]);

  const submissionRows = assessmentRows.length ? await db.select({
    assessmentId: submissions.assessmentId, studentProfileId: submissions.studentProfileId,
    attemptNumber: submissions.attemptNumber, timeliness: submissions.timeliness,
    status: submissions.status,
  }).from(submissions).where(inArray(submissions.assessmentId, assessmentRows.map(a => a.id)))
    .orderBy(desc(submissions.attemptNumber), desc(submissions.updatedAt)) : [];

  // The first row per occurrence is the latest recorded correction, not an
  // additive event. Original absences must not survive approved excuses in metrics.
  const effectiveAttendance = effectiveAttendanceEvents(attendanceRows);
  const latestSubmissions = new Map<string, (typeof submissionRows)[number]>();
  for (const submission of submissionRows) {
    const key = submission.assessmentId + ":" + submission.studentProfileId;
    if (!latestSubmissions.has(key)) latestSubmissions.set(key, submission);
  }
  const assessmentProgram = new Map(assessmentRows.map(a => [a.id, a.programId]));
  const activeProfiles = new Set(enrollmentRows.map(e =>
    [e.programId, e.schoolYearId, e.studentProfileId].join(":")));
  const applicationProfiles = new Map(applicationRows.map(a => [a.id, a.studentProfileId]));

  return {
    windowDays: 30,
    programs: programRows.map(program => {
      const activeYears = yearRows.filter(y =>
        y.siteId === program.siteId && y.organizationId === program.organizationId &&
        (!y.programId || y.programId === program.id) && y.status === "active");
      const activeSections = sectionRows.filter(s => s.programId === program.id && s.active).length;
      const journey = launchJourneys.find(j => j.participantId === program.id);
      const outstandingRequirements = launchRequirements.filter(r =>
        r.programId === program.id && r.blocking && r.status !== "complete").length;
      const programApplications = applicationRows.filter(a => a.programId === program.id);
      const accepted = programApplications.filter(a => a.stage === "accepted");
      const enrolled = enrollmentRows.filter(e => e.programId === program.id).length;
      // An enrollment in an earlier school year does not activate a newly
      // accepted offer for the next school year.
      const pendingActivation = offerRows.filter(o => o.programId === program.id &&
        o.status === "accepted" && !activeProfiles.has([
          program.id, o.schoolYearId, applicationProfiles.get(o.applicationId),
        ].join(":"))).length;
      const grades = [...latestSubmissions.values()].filter(s =>
        assessmentProgram.get(s.assessmentId) === program.id);
      const attendance = effectiveAttendance.filter(e => e.programId === program.id);
      const byStatus = (status: string) => attendance.filter(e => e.status === status).length;

      return {
        id: program.id, name: program.name, type: program.type, status: program.status,
        siteId: program.siteId,
        launch: {
          journeyStatus: journey?.status ?? null,
          outstandingRequirements,
          hasActiveSchoolYear: activeYears.length > 0,
          activeSections,
        },
        enrollment: {
          applications: programApplications.length,
          acceptedApplications: accepted.length,
          offersAwaitingResponse: offerRows.filter(o => o.programId === program.id && o.status === "issued").length,
          activeProgramEnrollments: enrolled,
          acceptedAwaitingActivation: pendingActivation,
        },
        learning: {
          missingLatestAttempts: grades.filter(s => s.timeliness === "missing" &&
            (s.status === "assigned" || s.status === "returned")).length,
          lateAwaitingGrade: grades.filter(s => s.timeliness === "late" && s.status === "submitted").length,
          openProgramActions: actionRows.filter(a => a.programId === program.id).length,
        },
        attendance: {
          recordedOccurrences: attendance.length,
          present: byStatus("present"), absent: byStatus("absent"),
          tardy: byStatus("tardy"), excused: byStatus("excused"),
          pendingExcuses: excuseRows.filter(e => e.programId === program.id).length,
        },
      };
    }),
  };
});

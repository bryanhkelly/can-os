import { db } from "@/db/client";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { currentSectionStudentIds } from "./current-section-enrollment.server";
import { requireTeachingEligibility } from "@/modules/staffing/teaching-eligibility.server";
import { AuthorizationError } from "@/domain/command-context";
import {
assessments,
domainEvents,
guardianRelationships,
people,
sectionTeachers,
sections,
studentProfiles,
terms,
submissions
} from "@/db/schema";
import { EventTypes } from "@/domain/event-types";
import { notifyMany } from "@/platform/mutation";
import { and,eq } from "drizzle-orm";

/**
 * GF1 event handlers for academic events that have user-visible consequences.
 * The domain mutation remains the source of truth; these handlers only project
 * that fact into contextual notifications and then let the worker mark the
 * event processed.
 */

async function loadSubmissionContext(tx: any, submissionId: string, includeTeacherRecipients = false) {
  const [record] = await tx
    .select({
      submissionId: submissions.id,
      assessmentTitle: assessments.title,
      sectionId: assessments.sectionId,
      programId: sections.programId,
      schoolYearId: terms.schoolYearId,
      studentProfileId: submissions.studentProfileId,
      studentPersonId: studentProfiles.personId,
      studentPreferredName: people.preferredName,
      studentLegalFirstName: people.legalFirstName,
      score: submissions.score,
      timeliness: submissions.timeliness,
    })
    .from(submissions)
    .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
    .innerJoin(sections, eq(sections.id, assessments.sectionId))
    .innerJoin(terms, eq(terms.id, sections.termId))
    .innerJoin(studentProfiles, eq(studentProfiles.id, submissions.studentProfileId))
    .innerJoin(people, eq(people.id, studentProfiles.personId))
    .where(eq(submissions.id, submissionId))
    .limit(1);

  if (!record) return null;

  // The event may be processed after a transfer or withdrawal. Do not emit
  // a new child-specific notice from stale Section-only membership.
  const enrolled = await currentSectionStudentIds(tx, {
    id: record.sectionId, programId: record.programId, schoolYearId: record.schoolYearId,
  }, record.studentProfileId);
  if (!enrolled.includes(record.studentProfileId)) return {
    ...record, activeEnrollment: false, guardianPersonIds: [] as string[],
    teacherPersonIds: [] as string[], studentName: record.studentPreferredName ?? record.studentLegalFirstName,
  };

  const [guardians, teachers] = await Promise.all([
    tx
      .select({ personId: guardianRelationships.guardianPersonId })
      .from(guardianRelationships)
      .where(guardianRelationshipPredicate({
        studentPersonId: record.studentPersonId, access: "academic",
      })),
    includeTeacherRecipients ? tx
      .select({ personId: sectionTeachers.personId })
      .from(sectionTeachers)
      .where(and(eq(sectionTeachers.sectionId, record.sectionId), eq(sectionTeachers.role, "teacher"))) : Promise.resolve([]),
  ]);

  // Historic, assistant, revoked or unqualified assignments are not an
  // entitlement to receive a child-specific late-work notification.
  const eligibleTeacherIds: string[] = [];
  for (const teacher of teachers) {
    try {
      await requireTeachingEligibility(record.sectionId, teacher.personId, tx, {
        horizon: "current", requireAssignment: true,
      });
      eligibleTeacherIds.push(teacher.personId);
    } catch (error) {
      if (!(error instanceof AuthorizationError)) throw error;
    }
  }

  return {
    ...record,
    activeEnrollment: true,
    studentName: record.studentPreferredName ?? record.studentLegalFirstName,
    guardianPersonIds: guardians.map((row: { personId: string }) => row.personId),
    teacherPersonIds: eligibleTeacherIds,
  };
}

export async function handleSubmissionReceivedEvent(eventId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.id, eventId))
      .limit(1);

    if (!event || event.status === "processed") return;
    if (event.eventType !== EventTypes.SubmissionReceived) return;

    const context = await loadSubmissionContext(tx, event.aggregateId, true);
    if (!context) throw new Error("Missing submission context for SubmissionReceived");
    if (!context.activeEnrollment) return;

    const payload = event.payload as Record<string, unknown>;
    const timeliness =
      payload.timeliness === "late" || context.timeliness === "late" ? "late" : "on_time";

    // A late recovery is actionable for the teacher. On-time submissions do not
    // need a new notification because they already appear in the normal grading queue.
    if (timeliness === "late" && context.teacherPersonIds.length) {
      const recipients: string[] = [...new Set<string>(context.teacherPersonIds as string[])];
      await notifyMany(tx, recipients.map((recipientPersonId: string) => ({
          recipientPersonId,
          type: "late_submission_received",
          title: `${context.studentName} submitted ${context.assessmentTitle}`,
          body: "Previously missing work has now been submitted and is ready for review.",
          resourceType: "submission",
          resourceId: context.submissionId,
          eventId: event.id,
        })));
    }
  });
}

export async function handleGradePostedEvent(eventId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.id, eventId))
      .limit(1);

    if (!event || event.status === "processed") return;
    if (event.eventType !== EventTypes.GradePosted) return;

    // GF25 also uses GradePosted for finalized section grades. GF1 handles the
    // submission aggregate only; other aggregate types remain safe pass-through
    // events until their owning flow adds a projection.
    if (event.aggregateType !== "submission") return;

    const context = await loadSubmissionContext(tx, event.aggregateId);
    if (!context) throw new Error("Missing submission context for GradePosted");
    if (!context.activeEnrollment) return;

    const recipients = new Set<string>([
      String(context.studentPersonId),
      ...(context.guardianPersonIds as string[]),
    ]);

    const scoreText = context.score === null ? "" : ` Score: ${context.score}.`;

    if (recipients.size) {
      await notifyMany(tx, [...recipients].map((recipientPersonId) => ({
          recipientPersonId,
          type: "grade_posted",
          title: `${context.assessmentTitle} has been graded`,
          body:
            recipientPersonId === context.studentPersonId
              ? `Your teacher posted a grade for ${context.assessmentTitle}.${scoreText}`
              : `${context.studentName}'s grade for ${context.assessmentTitle} is available.${scoreText}`,
          resourceType: "submission",
          resourceId: context.submissionId,
          eventId: event.id,
        })));
    }
  });
}

/**
 * Some GF1 events are durable integration facts without an in-process
 * projection. Registering this handler lets the outbox complete them and lets
 * subscription matching run without inventing duplicate side effects.
 */
export async function handleAcademicPassThroughEvent(_eventId: string): Promise<void> {
  return;
}

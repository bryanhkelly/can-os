import { db } from "@/db/client";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import {
assessments,
domainEvents,
guardianRelationships,
people,
sectionTeachers,
studentProfiles,
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

async function loadSubmissionContext(tx: any, submissionId: string) {
  const [record] = await tx
    .select({
      submissionId: submissions.id,
      assessmentTitle: assessments.title,
      sectionId: assessments.sectionId,
      studentPersonId: studentProfiles.personId,
      studentPreferredName: people.preferredName,
      studentLegalFirstName: people.legalFirstName,
      score: submissions.score,
      timeliness: submissions.timeliness,
    })
    .from(submissions)
    .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
    .innerJoin(studentProfiles, eq(studentProfiles.id, submissions.studentProfileId))
    .innerJoin(people, eq(people.id, studentProfiles.personId))
    .where(eq(submissions.id, submissionId))
    .limit(1);

  if (!record) return null;

  const [guardians, teachers] = await Promise.all([
    tx
      .select({ personId: guardianRelationships.guardianPersonId })
      .from(guardianRelationships)
      .where(guardianRelationshipPredicate({
        studentPersonId: record.studentPersonId, access: "academic",
      })),
    tx
      .select({ personId: sectionTeachers.personId })
      .from(sectionTeachers)
      .where(eq(sectionTeachers.sectionId, record.sectionId)),
  ]);

  return {
    ...record,
    studentName: record.studentPreferredName ?? record.studentLegalFirstName,
    guardianPersonIds: guardians.map((row: { personId: string }) => row.personId),
    teacherPersonIds: teachers.map((row: { personId: string }) => row.personId),
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

    const context = await loadSubmissionContext(tx, event.aggregateId);
    if (!context) throw new Error("Missing submission context for SubmissionReceived");

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

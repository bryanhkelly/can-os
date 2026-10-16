import { and, eq } from "drizzle-orm";
import {
  assessments,
  guardianRelationships,
  people,
  sectionTeachers,
  studentProfiles,
  submissions,
} from "@/db/schema";
import { EventTypes } from "@/domain/event-types";
import type {
  DomainEventRecord,
  NotificationPlan,
  NotificationPolicy,
  PolicyTx,
} from "@/platform/notifications/policy";

/**
 * Policy for EventTypes.AssignmentBecameMissing: the student, their
 * guardians with academic visibility, and the section's teachers are
 * notified; the student gets recovery-oriented copy while adults get
 * follow-up copy. Recipients are deduplicated — a person who is both
 * guardian and teacher receives one notification.
 */
export type AssignmentMissingContext = {
  submissionId: string;
  assessmentId: string;
  assessmentTitle: string;
  sectionId: string;
  studentProfileId: string;
  studentPersonId: string;
  studentName: string;
  guardianPersonIds: string[];
  teacherPersonIds: string[];
};

export const assignmentMissingPolicy: NotificationPolicy<AssignmentMissingContext> = {
  eventType: EventTypes.AssignmentBecameMissing,

  async load(tx: PolicyTx, event: DomainEventRecord) {
    const [record] = await tx
      .select({
        submissionId: submissions.id,
        assessmentId: assessments.id,
        assessmentTitle: assessments.title,
        sectionId: assessments.sectionId,
        studentProfileId: submissions.studentProfileId,
        studentPersonId: studentProfiles.personId,
        studentPreferredName: people.preferredName,
        studentLegalFirstName: people.legalFirstName,
      })
      .from(submissions)
      .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
      .innerJoin(
        studentProfiles,
        eq(studentProfiles.id, submissions.studentProfileId),
      )
      .innerJoin(people, eq(people.id, studentProfiles.personId))
      .where(eq(submissions.id, event.aggregateId))
      .limit(1);

    if (!record) return null;

    const guardians = await tx
      .select({ personId: guardianRelationships.guardianPersonId })
      .from(guardianRelationships)
      .where(
        and(
          eq(guardianRelationships.studentPersonId, record.studentPersonId),
          eq(guardianRelationships.canViewAcademics, true),
        ),
      );

    const teachers = await tx
      .select({ personId: sectionTeachers.personId })
      .from(sectionTeachers)
      .where(eq(sectionTeachers.sectionId, record.sectionId));

    return {
      submissionId: record.submissionId,
      assessmentId: record.assessmentId,
      assessmentTitle: record.assessmentTitle,
      sectionId: record.sectionId,
      studentProfileId: record.studentProfileId,
      studentPersonId: record.studentPersonId,
      studentName: record.studentPreferredName ?? record.studentLegalFirstName,
      guardianPersonIds: guardians.map((row) => row.personId),
      teacherPersonIds: teachers.map((row) => row.personId),
    };
  },

  plans(context: AssignmentMissingContext): NotificationPlan[] {
    const recipients = new Set([
      context.studentPersonId,
      ...context.guardianPersonIds,
      ...context.teacherPersonIds,
    ]);

    return [...recipients].map((recipientPersonId) => ({
      recipientPersonId,
      type: "missing_assignment",
      title: `${context.assessmentTitle} is missing`,
      body:
        recipientPersonId === context.studentPersonId
          ? "Submit the assignment when ready. If you need help, contact your teacher."
          : `${context.studentName} has a missing assignment that may need follow-up.`,
      resourceType: "submission",
      resourceId: context.submissionId,
    }));
  },
};

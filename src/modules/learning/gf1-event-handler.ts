import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  assessments,
  domainEvents,
  guardianRelationships,
  insights,
  notifications,
  people,
  sectionTeachers,
  studentProfiles,
  submissions,
} from "@/db/schema";
import { EventTypes } from "@/domain/event-types";

export async function handleAcademicInterventionEvent(
  eventId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.id, eventId))
      .limit(1);

    if (!event || event.status === "processed") return;
    if (event.eventType !== EventTypes.AssignmentBecameMissing) return;

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

    if (!record) throw new Error("Missing submission context for domain event");

    const studentName =
      record.studentPreferredName ?? record.studentLegalFirstName;

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

    await tx.insert(insights).values({
      type: "missing_assignment",
      title: `${studentName} missed ${record.assessmentTitle}`,
      summary:
        "The assignment deadline passed without a submission. Review context before deciding whether formal intervention is needed.",
      subjectType: "student_profile",
      subjectId: record.studentProfileId,
      sectionId: record.sectionId,
      evidence: [
        {
          submissionId: record.submissionId,
          assessmentId: record.assessmentId,
          fact: "assigned_and_missing",
        },
      ],
      uncertainty:
        "A missing submission alone does not establish academic risk or intent.",
      recommendedActions: [
        {
          type: "academic_follow_up",
          title: "Review missing assignment with student",
          description:
            "Confirm the reason, coordinate with the family if appropriate, and decide whether a support Action is needed.",
        },
      ],
    });

    const recipients = new Set([
      record.studentPersonId,
      ...guardians.map((row) => row.personId),
      ...teachers.map((row) => row.personId),
    ]);

    if (recipients.size > 0) {
      await tx.insert(notifications).values(
        [...recipients].map((recipientPersonId) => ({
          recipientPersonId,
          type: "missing_assignment",
          title: `${record.assessmentTitle} is missing`,
          body:
            recipientPersonId === record.studentPersonId
              ? "Submit the assignment when ready. If you need help, contact your teacher."
              : `${studentName} has a missing assignment that may need follow-up.`,
          resourceType: "submission",
          resourceId: record.submissionId,
          eventId: event.id,
        })),
      );
    }

    await tx
      .update(domainEvents)
      .set({
        status: "processed",
        processedAt: new Date(),
      })
      .where(eq(domainEvents.id, event.id));
  });
}

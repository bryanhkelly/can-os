import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { domainEvents, insights } from "@/db/schema";
import { EventTypes } from "@/domain/event-types";
import { applyNotificationPolicy } from "@/platform/notifications";
import { assignmentMissingPolicy } from "@/platform/notifications/policies";
import {
  emailNotificationRecipients,
  sendNotificationEmail,
} from "@/modules/communication/notification-email.server";

export async function handleAcademicInterventionEvent(
  eventId: string,
): Promise<void> {
  let guardianEmailNotice:
    | {
        guardianPersonIds: string[];
        studentName: string;
        assessmentTitle: string;
      }
    | undefined;

  await db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.id, eventId))
      .limit(1);

    if (!event || event.status === "processed") return;
    if (event.eventType !== EventTypes.AssignmentBecameMissing) return;

    const context = await assignmentMissingPolicy.load(tx, event);
    if (!context) throw new Error("Missing submission context for domain event");

    await tx.insert(insights).values({
      type: "missing_assignment",
      title: `${context.studentName} missed ${context.assessmentTitle}`,
      summary:
        "The assignment deadline passed without a submission. Review context before deciding whether formal intervention is needed.",
      subjectType: "student_profile",
      subjectId: context.studentProfileId,
      organizationId: context.organizationId,
      siteId: context.siteId,
      programId: context.programId,
      sectionId: context.sectionId,
      evidence: [
        {
          submissionId: context.submissionId,
          assessmentId: context.assessmentId,
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

    await applyNotificationPolicy(tx, event, assignmentMissingPolicy, context);

    await tx
      .update(domainEvents)
      .set({
        status: "processed",
        processedAt: new Date(),
      })
      .where(eq(domainEvents.id, event.id));

    guardianEmailNotice = {
      guardianPersonIds: context.guardianPersonIds,
      studentName: context.studentName,
      assessmentTitle: context.assessmentTitle,
    };
  });

  if (guardianEmailNotice && guardianEmailNotice.guardianPersonIds.length > 0) {
    const { guardianPersonIds, studentName, assessmentTitle } =
      guardianEmailNotice;
    const emails = await emailNotificationRecipients(guardianPersonIds);
    const origin = process.env.CAN_ACCESS_PUBLIC_ORIGIN;
    const actionUrl = origin ? `${new URL(origin).origin}/guardian` : undefined;
    await Promise.all(
      guardianPersonIds.map(async (personId) => {
        const to = emails.get(personId);
        if (!to) return;
        await sendNotificationEmail({
          to,
          subject: `${assessmentTitle} is missing`,
          text: `${studentName} has a missing assignment: ${assessmentTitle}. Sign in to CAN OS to review it and follow up.`,
          actionUrl,
        });
      }),
    );
  }
}

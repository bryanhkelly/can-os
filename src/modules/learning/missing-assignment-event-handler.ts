import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { domainEvents, guardianRelationships, insights } from "@/db/schema";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { and, inArray } from "drizzle-orm";
import { EventTypes } from "@/domain/event-types";
import { emitEvent, writeAudit } from "@/platform/mutation";
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
        studentPersonId: string;
        studentName: string;
        assessmentTitle: string;
        organizationId: string | null;
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

    const [insight] = await tx.insert(insights).values({
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
    }).returning({ id: insights.id });

    if (!insight) throw new Error("Failed to create insight");

    await emitEvent(tx, {
      eventType: EventTypes.InsightCreated,
      aggregateType: "insight",
      aggregateId: insight.id,
      actorPersonId: null,
      organizationId: context.organizationId,
      siteId: context.siteId,
      programId: context.programId,
      sectionId: context.sectionId,
      payload: {
        insightType: "missing_assignment",
        subjectType: "student_profile",
        subjectId: context.studentProfileId,
        sourceEventId: event.id,
      },
    });

    await writeAudit(tx, {
      actorPersonId: null,
      action: "insight.created",
      resourceType: "insight",
      resourceId: insight.id,
      scope: {
        organizationId: context.organizationId,
        siteId: context.siteId,
        programId: context.programId,
        sectionId: context.sectionId,
      },
      after: {
        type: "missing_assignment",
        subjectType: "student_profile",
        subjectId: context.studentProfileId,
        sourceEventId: event.id,
      },
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
      studentPersonId:context.studentPersonId,
      studentName: context.studentName,
      assessmentTitle: context.assessmentTitle,
      organizationId: context.organizationId,
    };
  });

  if (guardianEmailNotice && guardianEmailNotice.guardianPersonIds.length > 0) {
    const { guardianPersonIds, studentPersonId, studentName, assessmentTitle } =
      guardianEmailNotice;
    // The transaction's original recipient list is NOT sufficient for
    // external email. Recheck relationship consent at delivery time.
    const current = await db.select({id:guardianRelationships.guardianPersonId})
      .from(guardianRelationships).where(and(
        guardianRelationshipPredicate({
          studentPersonId,access:"academic",
        }),
        inArray(guardianRelationships.guardianPersonId,guardianPersonIds),
      ));
    const allowed=new Set(current.map(row=>row.id));
    const emails = await emailNotificationRecipients(
      guardianPersonIds.filter(id=>allowed.has(id)),
      guardianEmailNotice.organizationId,
    );
    const origin = process.env.CAN_ACCESS_PUBLIC_ORIGIN;
    const actionUrl = origin ? `${new URL(origin).origin}/guardian` : undefined;
    await Promise.all(
      guardianPersonIds.map(async (personId) => {
        const to = allowed.has(personId) ? emails.get(personId) : undefined;
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

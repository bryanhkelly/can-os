import { and, eq } from "drizzle-orm";
import {
  guardianRelationships,
  sectionTeachers,
  submissions,
} from "@/db/schema";
import { EventTypes } from "@/domain/event-types";
import type { DomainEventRecord, PolicyTx } from "@/platform/notifications/policy";
import {
  assignmentMissingPolicy,
  type AssignmentMissingContext,
} from "@/platform/notifications/policies/assignment-missing";
import type { SubscriptionEventPolicy } from "../policy";

/**
 * Subscription behavior for AssignmentBecameMissing. Reuses the notification
 * policy's context load so an aggregate is queried once per event. Delivery is
 * authorized for the student, guardians with current academic visibility, and
 * the section's teachers — re-evaluated on every delivery.
 */
export const assignmentMissingSubscriptionPolicy: SubscriptionEventPolicy<AssignmentMissingContext> = {
  eventType: EventTypes.AssignmentBecameMissing,

  load: (tx: PolicyTx, event: DomainEventRecord) =>
    assignmentMissingPolicy.load(tx, event),
  organizationId: context => context.organizationId,

  subjects(context) {
    return [
      { subjectType: "student_profile", subjectId: context.studentProfileId },
      { subjectType: "person", subjectId: context.studentPersonId },
    ];
  },

  async authorize(tx, context, subscriberPersonId) {
    if (subscriberPersonId === context.studentPersonId) return true;

    if (context.guardianPersonIds.includes(subscriberPersonId)) {
      const [guardian] = await tx
        .select({ id: guardianRelationships.id })
        .from(guardianRelationships)
        .where(
          and(
            eq(guardianRelationships.guardianPersonId, subscriberPersonId),
            eq(guardianRelationships.studentPersonId, context.studentPersonId),
            eq(guardianRelationships.canViewAcademics, true),
          ),
        )
        .limit(1);
      if (guardian) return true;
    }

    const [teacher] = await tx
      .select({ personId: sectionTeachers.personId })
      .from(sectionTeachers)
      .where(
        and(
          eq(sectionTeachers.sectionId, context.sectionId),
          eq(sectionTeachers.personId, subscriberPersonId),
        ),
      )
      .limit(1);

    return Boolean(teacher);
  },

  content(context, kind) {
    const title =
      kind === "reminder"
        ? `Reminder: ${context.assessmentTitle} is still missing`
        : `${context.assessmentTitle} is missing`;
    return {
      title,
      body: `${context.studentName} has a missing assignment: ${context.assessmentTitle}.`,
      resourceType: "submission",
      resourceId: context.submissionId,
    };
  },

  async conditionHolds(tx, context) {
    const [submission] = await tx
      .select({ timeliness: submissions.timeliness })
      .from(submissions)
      .where(eq(submissions.id, context.submissionId))
      .limit(1);
    return submission?.timeliness === "missing";
  },
};

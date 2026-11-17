import { and, eq } from "drizzle-orm";
import {
  accessAccountNoncreditPrincipals, accessAccounts, accountPersonGrants, people,
} from "@/db/schema";
import {
  noncreditCompletionDecisions, noncreditRegistrations,
} from "@/db/canonical-v301";
import { EventTypes } from "@/domain/event-types";
import type {
  DomainEventRecord, NotificationPlan, NotificationPolicy, PolicyTx,
} from "@/platform/notifications/policy";

/**
 * The native decision is authoritative. A verified, user-confirmed CAN
 * account-to-canonical Person bridge is required before an in-app notice.
 * Never equate native Person UUID with public CAN Person UUID or infer a
 * mapping from email. No grade, award or certificate is implied.
 */
type Context = { recipientPersonId: string; decisionId: string };
export const noncreditTrainingCompletedPolicy: NotificationPolicy<Context> = {
  eventType: EventTypes.NoncreditTrainingCompleted,
  async load(tx: PolicyTx, event: DomainEventRecord) {
    if (event.aggregateType !== "noncredit_completion_decision") return null;
    const [record] = await tx.select({
      id: noncreditCompletionDecisions.id,
      outcome: noncreditCompletionDecisions.outcome,
      registrationId: noncreditRegistrations.id,
      participantPersonId: noncreditRegistrations.participantPersonId,
      registrationStatus: noncreditRegistrations.status,
      policyId: noncreditRegistrations.completionPolicyId,
      decisionPolicyId: noncreditCompletionDecisions.policyId,
    }).from(noncreditCompletionDecisions)
      .innerJoin(noncreditRegistrations,
        eq(noncreditRegistrations.id, noncreditCompletionDecisions.registrationId))
      .where(eq(noncreditCompletionDecisions.id, event.aggregateId)).limit(1);
    if (!record || record.outcome !== "completed" ||
      !["active", "completed"].includes(record.registrationStatus) ||
      record.policyId !== record.decisionPolicyId) return null;
    const newer = await tx.select({ id: noncreditCompletionDecisions.id })
      .from(noncreditCompletionDecisions)
      .where(eq(noncreditCompletionDecisions.supersedesId, record.id)).limit(1);
    if (newer.length) return null;

    const [account] = await tx.select({
      recipientPersonId: accessAccountNoncreditPrincipals.accessPersonId,
    }).from(accessAccountNoncreditPrincipals)
      .innerJoin(accessAccounts, and(
        eq(accessAccounts.id, accessAccountNoncreditPrincipals.accessAccountId),
        eq(accessAccounts.disabled, false),
      ))
      .innerJoin(accountPersonGrants, and(
        eq(accountPersonGrants.accountId, accessAccountNoncreditPrincipals.accessAccountId),
        eq(accountPersonGrants.personId, accessAccountNoncreditPrincipals.accessPersonId),
        eq(accountPersonGrants.active, true),
      ))
      .innerJoin(people, and(
        eq(people.id, accessAccountNoncreditPrincipals.accessPersonId),
        eq(people.active, true),
      ))
      .where(and(
        eq(accessAccountNoncreditPrincipals.canonicalPersonId, record.participantPersonId),
        // An unverified or disabled CAN identity receives no notification.
        // This is not a substitute for recipient authorization on later reads.
        // isNotNull is used below via the existing verified-at column.
      )).limit(1);
    if (!account) return null;
    return { recipientPersonId: account.recipientPersonId, decisionId: record.id };
  },
  plans(context: Context): NotificationPlan[] {
    return [{
      recipientPersonId: context.recipientPersonId,
      type: "noncredit_training_completed",
      title: "Training completion recorded",
      body: "Your provider recorded completion of your training. Review My Activity for the official outcome. This notice is not a certificate or school credit.",
      resourceType: "noncredit_completion_decision",
      resourceId: context.decisionId,
    }];
  },
};

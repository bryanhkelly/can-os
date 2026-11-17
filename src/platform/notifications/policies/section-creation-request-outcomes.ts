import { eq } from "drizzle-orm";
import { actions } from "@/db/schema";
import { EventTypes } from "@/domain/event-types";
import type { DomainEventRecord, NotificationPlan, NotificationPolicy, PolicyTx } from "@/platform/notifications/policy";

/**
 * The request Action is authoritative. Send a private outcome notification to
 * its owner only; an event alone cannot infer approval or grant a Section.
 * Stale events are suppressed if the Action's current status differs.
 */
type Outcome = "declined" | "fulfilled";
type Context = { requestId: string; ownerId: string; title: string; outcome: Outcome };
function classRequestOutcomePolicy(
  eventType: typeof EventTypes.SectionCreationRequestDeclined | typeof EventTypes.SectionCreationRequestFulfilled,
  outcome: Outcome,
): NotificationPolicy<Context> {
  return {
    eventType,
    async load(tx: PolicyTx, event: DomainEventRecord) {
      if (event.aggregateType !== "action") return null;
      const [request] = await tx.select({
        id: actions.id, type: actions.type, status: actions.status,
        ownerId: actions.ownerPersonId, title: actions.title,
        metadata: actions.metadata,
      }).from(actions).where(eq(actions.id, event.aggregateId)).limit(1);
      if (!request || request.type !== "section_creation_request" || !request.ownerId) return null;
      if (outcome === "declined" && request.status !== "cancelled") return null;
      if (outcome === "fulfilled" && (request.status !== "resolved" ||
        typeof request.metadata?.provisionedSectionId !== "string")) return null;
      return {requestId: request.id, ownerId: request.ownerId, title: request.title, outcome};
    },
    plans(context: Context): NotificationPlan[] {
      return [{
        recipientPersonId: context.ownerId,
        type: context.outcome === "fulfilled" ? "section_creation_request_fulfilled" : "section_creation_request_declined",
        title: context.outcome === "fulfilled" ? "Class setup request completed" : "Class setup request declined",
        body: context.outcome === "fulfilled"
          ? "Your class setup request has been completed. Open your request for details."
          : "Your class setup request was declined. Open your request to review the decision.",
        resourceType: "action", resourceId: context.requestId,
      }];
    },
  };
}
export const sectionCreationRequestDeclinedPolicy =
  classRequestOutcomePolicy(EventTypes.SectionCreationRequestDeclined, "declined");
export const sectionCreationRequestFulfilledPolicy =
  classRequestOutcomePolicy(EventTypes.SectionCreationRequestFulfilled, "fulfilled");

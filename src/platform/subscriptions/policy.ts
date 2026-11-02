import type { DomainEventRecord, PolicyTx } from "@/platform/notifications/policy";

export type SubscriptionSubject = { subjectType: string; subjectId: string };

export type SubscriptionDeliveryKind = "initial" | "reminder";

export type SubscriptionContent = {
  title: string;
  body?: string;
  resourceType?: string;
  resourceId?: string;
};

/**
 * Subscription behavior for one domain event type. `load` runs once per
 * event and its context feeds matching, authorization, and content — each
 * aggregate is queried once per event, mirroring the notification policies.
 *
 * `authorize` is the delivery-time permission re-check: a subscription is
 * never a cached grant, so every delivery re-evaluates the subscriber's
 * relationship to the event's subject against current records.
 */
export interface SubscriptionEventPolicy<C = unknown> {
  readonly eventType: string;
  load(tx: PolicyTx, event: DomainEventRecord): Promise<C | null>;
  /** Canonical source tenant from the loaded aggregate, never event metadata. */
  organizationId(context: C): string | null;
  /** Subjects the event concerns; subscriptions attach to one of these. */
  subjects(context: C): SubscriptionSubject[];
  authorize(
    tx: PolicyTx,
    context: C,
    subscriberPersonId: string,
  ): Promise<boolean>;
  content(context: C, kind: SubscriptionDeliveryKind): SubscriptionContent;
  /** Whether the watched condition still holds; gates reminder deliveries. */
  conditionHolds(tx: PolicyTx, context: C): Promise<boolean>;
}

const policies = new Map<string, SubscriptionEventPolicy<never>>();

export function registerSubscriptionPolicy<C>(policy: SubscriptionEventPolicy<C>): void {
  policies.set(policy.eventType, policy as SubscriptionEventPolicy<never>);
}

export function getSubscriptionPolicy(
  eventType: string,
): SubscriptionEventPolicy<never> | undefined {
  return policies.get(eventType);
}

import type { domainEvents } from "@/db/schema";
import { notifyMany, type MutationTx, type NotificationInput } from "@/platform/mutation";

/**
 * Transaction type for policy context loading. Type-only import of the db
 * client: erased at compile time, so this module stays safe to reference
 * from server functions without pulling server-only code into client bundles.
 */
export type PolicyTx = Parameters<
  Parameters<(typeof import("@/db/client"))["db"]["transaction"]>[0]
>[0];

export type DomainEventRecord = typeof domainEvents.$inferSelect;

export type NotificationPlan = Omit<NotificationInput, "eventId">;

/**
 * Notification policy for one domain event type: which people should hear
 * about it, and with what content. `load` gathers the context needed to
 * decide recipients and render copy; returning null skips notification
 * (callers decide whether a missing aggregate is an error). Handlers reuse
 * the loaded context for their own writes (insights, actions) so each
 * aggregate is queried once per event.
 */
export interface NotificationPolicy<C = unknown> {
  readonly eventType: string;
  load(tx: PolicyTx, event: DomainEventRecord): Promise<C | null>;
  plans(context: C, event: DomainEventRecord): NotificationPlan[];
}

const policies = new Map<string, NotificationPolicy<never>>();

export function registerNotificationPolicy<C>(policy: NotificationPolicy<C>): void {
  policies.set(policy.eventType, policy as NotificationPolicy<never>);
}

export function getNotificationPolicy(
  eventType: string,
): NotificationPolicy<never> | undefined {
  return policies.get(eventType);
}

/**
 * Materialize a policy's plans as in-app notification rows linked to the
 * originating event. Returns the created notification ids.
 */
export async function applyNotificationPolicy<C>(
  tx: PolicyTx & MutationTx,
  event: DomainEventRecord,
  policy: NotificationPolicy<C>,
  context: C,
): Promise<string[]> {
  const plans = policy.plans(context, event);
  if (!plans.length) return [];
  return notifyMany(
    tx,
    plans.map((plan) => ({ ...plan, eventId: event.id })),
  );
}

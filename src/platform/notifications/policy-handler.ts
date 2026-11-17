import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { domainEvents } from "@/db/schema";
import {
  applyNotificationPolicy,
  getNotificationPolicy,
} from "@/platform/notifications";
// Register every notification policy before the handler resolves by event type.
import "@/platform/notifications/policies";

/**
 * Generic outbox consumer for events whose only projection is a registered
 * notification policy. A missing aggregate or unusable payload (policy load
 * returning null) completes the event without notifications — these events
 * were previously pass-through, so notification delivery must fail soft
 * rather than wedge the outbox into retries. The worker marks the event
 * processed after the handler returns.
 */
export async function handleNotificationPolicyEvent(eventId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.id, eventId))
      .limit(1)
      .for("update");

    if (!event || event.status === "processed") return;

    const policy = getNotificationPolicy(event.eventType);
    if (policy) {
      const context = await policy.load(tx, event);
      if (context) await applyNotificationPolicy(tx, event, policy, context);
    }

    // Acknowledge the event in the same transaction as its notification rows.
    // A crash after that transaction must not replay the notification policy.
    // Subscription fan-out retains its own independent recovery mechanism.
    await tx.update(domainEvents).set({
      status: "processed", processedAt: new Date(), nextAttemptAt: null,
    }).where(eq(domainEvents.id, eventId));
  });
}

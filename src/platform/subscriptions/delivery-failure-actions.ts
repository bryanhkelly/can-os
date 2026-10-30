import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { actions, subscriptionDeliveries } from "@/db/schema";

/** Convert terminal delivery failures into canonical operational work. */
export async function escalateTerminalDeliveryFailures(limit = 50): Promise<number> {
  const candidates = await db.select({ id: subscriptionDeliveries.id, lastError: subscriptionDeliveries.lastError })
    .from(subscriptionDeliveries)
    .where(and(
      eq(subscriptionDeliveries.status, "failed"),
      isNull(subscriptionDeliveries.nextAttemptAt),
      sql`NOT EXISTS (
        SELECT 1 FROM actions a
        WHERE a.subject_type = 'subscription_delivery'
          AND a.subject_id = ${subscriptionDeliveries.id}
          AND a.type = 'outbound_notification_failed'
      )`,
    )).limit(limit);
  let count = 0;
  for (const candidate of candidates) {
    await db.transaction(async tx => {
      // Serialize reconciler runs for this delivery to prevent duplicate actions.
      const [delivery] = await tx.select({ id: subscriptionDeliveries.id })
        .from(subscriptionDeliveries)
        .where(eq(subscriptionDeliveries.id, candidate.id)).limit(1).for("update");
      if (!delivery) return;
      const [prior] = await tx.select({ id: actions.id }).from(actions)
        .where(and(eq(actions.subjectType, "subscription_delivery"),
          eq(actions.subjectId, candidate.id), eq(actions.type, "outbound_notification_failed")))
        .limit(1);
      if (prior) return;
      await tx.insert(actions).values({
        type: "outbound_notification_failed",
        status: "open", priority: "high",
        title: "Review failed CAN notification delivery",
        description: candidate.lastError ?? "Delivery failed; inspect provider and recipient settings.",
        subjectType: "subscription_delivery", subjectId: candidate.id,
      });
      count++;
    });
  }
  return count;
}

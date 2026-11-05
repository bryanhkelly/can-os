import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { scheduledReminders } from "@/db/schema";
import { notify } from "@/platform/mutation";

export async function processScheduledReminders(limit = 100): Promise<{ delivered: number; failed: number }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error("Reminder batch limit must be between 1 and 1000");
  }
  let delivered = 0;
  let failed = 0;
  for (let index = 0; index < limit; index++) {
    const outcome = await db.transaction(async tx => {
      const [reminder] = await tx.select().from(scheduledReminders)
        .where(and(eq(scheduledReminders.status, "pending"),
          lte(scheduledReminders.deliverAt, sql`CURRENT_TIMESTAMP`),
          or(isNull(scheduledReminders.nextAttemptAt),
            lte(scheduledReminders.nextAttemptAt, sql`CURRENT_TIMESTAMP`))))
        .orderBy(asc(scheduledReminders.deliverAt), asc(scheduledReminders.id))
        .limit(1).for("update", { skipLocked: true });
      if (!reminder) return "empty";
      const attempts = reminder.attempts + 1;
      try {
        await tx.transaction(async deliveryTx => {
          const notificationId = await notify(deliveryTx, {
            recipientPersonId: reminder.recipientPersonId,
            type: reminder.type, title: reminder.title, body: reminder.body,
            resourceType: reminder.resourceType, resourceId: reminder.resourceId,
          });
          await deliveryTx.update(scheduledReminders).set({
            status: "delivered", notificationId, attempts,
            deliveredAt: sql`CURRENT_TIMESTAMP`, nextAttemptAt: null, lastError: null,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          }).where(eq(scheduledReminders.id, reminder.id));
        });
        return "delivered";
      } catch {
        const terminal = attempts >= 8;
        const retrySeconds = Math.min(3600, 60 * 2 ** (attempts - 1));
        await tx.update(scheduledReminders).set({
          attempts, status: terminal ? "failed" : "pending",
          nextAttemptAt: terminal ? null : sql`CURRENT_TIMESTAMP + ${retrySeconds} * interval '1 second'`,
          lastError: "Reminder notification transaction failed",
          updatedAt: sql`CURRENT_TIMESTAMP`,
        }).where(eq(scheduledReminders.id, reminder.id));
        return "failed";
      }
    });
    if (outcome === "empty") break;
    if (outcome === "delivered") delivered++;
    else failed++;
  }
  return { delivered, failed };
}
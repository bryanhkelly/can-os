import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { scheduledReminders } from "@/db/schema";
import { DomainError } from "@/domain/errors";

type ReminderTx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type ReminderInput = {
  idempotencyKey: string;
  deliverAt: Date;
  recipientPersonId: string;
  type: string;
  title: string;
  body?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
};

/** Internal primitive; callers authorize the recipient/resource and commit audit/event evidence. */
export async function scheduleReminder(
  tx: ReminderTx,
  reminder: ReminderInput,
): Promise<string> {
  validateDeliveryTime(reminder.deliverAt);
  if (!reminder.idempotencyKey.trim()) {
    throw new DomainError("VALIDATION_FAILED", "Reminder idempotency key is required");
  }
  const values = {
    ...reminder,
    body: reminder.body ?? null,
    resourceType: reminder.resourceType ?? null,
    resourceId: reminder.resourceId ?? null,
  };
  const [created] = await tx.insert(scheduledReminders).values(values)
    .onConflictDoNothing({ target: scheduledReminders.idempotencyKey })
    .returning({ id: scheduledReminders.id });
  if (created) return created.id;
  const [existing] = await tx.select().from(scheduledReminders)
    .where(eq(scheduledReminders.idempotencyKey, reminder.idempotencyKey));
  if (!existing || existing.recipientPersonId !== values.recipientPersonId ||
      existing.type !== values.type || existing.title !== values.title ||
      existing.body !== values.body || existing.resourceType !== values.resourceType ||
      existing.resourceId !== values.resourceId ||
      existing.deliverAt.getTime() !== values.deliverAt.getTime()) {
    throw new DomainError("CONFLICT", "Reminder key already belongs to a different schedule");
  }
  return existing.id;
}

function validateDeliveryTime(deliverAt: Date) {
  if (!(deliverAt instanceof Date) || !Number.isFinite(deliverAt.getTime())) {
    throw new DomainError("VALIDATION_FAILED", "Reminder delivery time must be a valid instant");
  }
}

type ReminderResource = { resourceType: string; resourceId: string };

export async function cancelReminders(tx: ReminderTx, resource: ReminderResource) {
  return tx.update(scheduledReminders).set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(scheduledReminders.resourceType, resource.resourceType),
      eq(scheduledReminders.resourceId, resource.resourceId), eq(scheduledReminders.status, "pending")))
    .returning({ id: scheduledReminders.id });
}

export async function rescheduleReminders(
  tx: ReminderTx, resource: ReminderResource, delivery: { deliverAt: Date; body?: string },
) {
  validateDeliveryTime(delivery.deliverAt);
  return tx.update(scheduledReminders).set({ ...delivery, attempts: 0, nextAttemptAt: null,
    lastError: null, updatedAt: new Date() })
    .where(and(eq(scheduledReminders.resourceType, resource.resourceType),
      eq(scheduledReminders.resourceId, resource.resourceId), eq(scheduledReminders.status, "pending")))
    .returning({ id: scheduledReminders.id });
}

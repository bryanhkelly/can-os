import { notify, type MutationTx } from "@/platform/mutation";

export type ReminderInput = {
  recipientPersonId: string;
  type: string;
  title: string;
  body?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
};

/**
 * Queue a reminder notification for a booked resource. Built on `notify` so
 * reminder rows share the canonical notification shape.
 *
 * TODO: the notifications table has no send_at/deliver-at column, so
 * reminders are delivered immediately at queue time. Add a `sendAt` parameter
 * here (and scheduled delivery) once the schema supports deferred send.
 */
export async function scheduleReminder(
  tx: MutationTx,
  reminder: ReminderInput,
): Promise<string> {
  return notify(tx, reminder);
}

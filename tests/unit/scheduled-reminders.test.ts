import { describe, expect, it, vi } from "vitest";
import { notifications, scheduledReminders } from "@/db/schema";
import { scheduleReminder } from "@/platform/scheduling/reminders";

describe("scheduleReminder", () => {
  it("persists tomorrow's delivery without creating a notification today", async () => {
    const calls: { table: unknown; values: unknown }[] = [];
    const insert = vi.fn(table => ({ values: (values: unknown) => {
      calls.push({ table, values });
      return { onConflictDoNothing: () => ({ returning: async () => [{ id: "reminder-1" }] }) };
    } }));
    const tx = { insert } as unknown as Parameters<typeof scheduleReminder>[0];
    const deliverAt = new Date(Date.now() + 86_400_000);
    expect(await scheduleReminder(tx, {
      idempotencyKey: "conference-1", recipientPersonId: "guardian-1",
      type: "conference_reminder", title: "Tomorrow", deliverAt,
    })).toBe("reminder-1");
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe(scheduledReminders);
    expect(calls[0].table).not.toBe(notifications);
    expect(calls[0].values).toMatchObject({ deliverAt });
  });
});
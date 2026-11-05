import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, SQL } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { notifications, scheduledReminders } from "@/db/schema";
const state = vi.hoisted(() => ({ client: null as unknown as import("@electric-sql/pglite").PGlite }));
vi.mock("@/db/client", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  state.client = new PGlite();
  return { db: drizzle(state.client) };
});
import { db } from "@/db/client";
import { cancelReminders, rescheduleReminders, scheduleReminder } from "@/platform/scheduling/reminders";
import { processScheduledReminders } from "@/workers/reminder-worker";

const recipientPersonId = "10000000-0000-4000-8000-000000000001";
const resource = { resourceType: "conference_booking", resourceId: "10000000-0000-4000-8000-000000000002" };
const input = (deliverAt = new Date(Date.now() - 1000)) => ({
  ...resource, recipientPersonId, idempotencyKey: "reminder:test", deliverAt,
  type: "conference_reminder", title: "Synthetic conference reminder",
});
beforeAll(async () => {
  await state.client.exec(`CREATE TABLE people (id uuid PRIMARY KEY); INSERT INTO people VALUES ('${recipientPersonId}');`);
  const dialect = new PgDialect();
  const columns = getTableConfig(notifications).columns.map(column => {
    const type = column.enumValues?.length ? "text" : column.getSQLType();
    const defaultValue = column.default instanceof SQL ? dialect.sqlToQuery(column.default).sql
      : column.default === undefined ? undefined : `'${String(column.default)}'`;
    return `"${column.name}" ${type}${column.notNull ? " NOT NULL" : ""}${column.primary ? " PRIMARY KEY" : ""}${defaultValue ? ` DEFAULT ${defaultValue}` : ""}`;
  });
  await state.client.exec(`CREATE TABLE notifications (${columns.join(",")})`);
  await state.client.exec(await readFile(new URL("../../drizzle/0073_scheduled_reminders.sql", import.meta.url), "utf8"));
});
beforeEach(async () => {
  await state.client.exec("DROP TRIGGER IF EXISTS fail_reminder_receipt ON scheduled_reminders; TRUNCATE scheduled_reminders, notifications;");
});
afterAll(async () => { await state.client.close(); });

describe("deferred reminder dispatch", () => {
  it("does not deliver tomorrow's reminder today and delivers it once when due", async () => {
    const reminder = input(new Date(Date.now() + 86_400_000));
    const id = await db.transaction(tx => scheduleReminder(tx, reminder));
    expect(await db.transaction(tx => scheduleReminder(tx, reminder))).toBe(id);
    expect(await processScheduledReminders()).toEqual({ delivered: 0, failed: 0 });
    expect(await db.select().from(notifications)).toEqual([]);
    await db.update(scheduledReminders).set({ deliverAt: new Date(Date.now() - 1000) });
    expect(await processScheduledReminders()).toEqual({ delivered: 1, failed: 0 });
    expect(await processScheduledReminders()).toEqual({ delivered: 0, failed: 0 });
    expect(await db.select().from(notifications)).toHaveLength(1);
  });
  it("rolls back a notification when receipt persistence fails, backs off, then retries once", async () => {
    await db.transaction(tx => scheduleReminder(tx, input()));
    await state.client.exec(`CREATE OR REPLACE FUNCTION reject_reminder_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.status = 'delivered' THEN RAISE EXCEPTION 'synthetic receipt failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_reminder_receipt BEFORE UPDATE ON scheduled_reminders FOR EACH ROW EXECUTE FUNCTION reject_reminder_receipt();`);
    expect(await processScheduledReminders()).toEqual({ delivered: 0, failed: 1 });
    expect(await db.select().from(notifications)).toEqual([]);
    expect(await db.select().from(scheduledReminders)).toEqual([expect.objectContaining({ attempts: 1, status: "pending", nextAttemptAt: expect.any(Date) })]);
    expect(await processScheduledReminders()).toEqual({ delivered: 0, failed: 0 });
    await state.client.exec("DROP TRIGGER fail_reminder_receipt ON scheduled_reminders;");
    await db.update(scheduledReminders).set({ nextAttemptAt: new Date(Date.now() - 1000) });
    expect(await processScheduledReminders()).toEqual({ delivered: 1, failed: 0 });
    expect(await processScheduledReminders()).toEqual({ delivered: 0, failed: 0 });
    expect(await db.select().from(notifications)).toHaveLength(1);
  });
  it("cancels pending reminders without delivery or revival on schedule retry", async () => {
    const reminder = input();
    await db.transaction(tx => scheduleReminder(tx, reminder));
    await db.transaction(tx => cancelReminders(tx, resource));
    await db.transaction(tx => scheduleReminder(tx, reminder));
    expect(await processScheduledReminders()).toEqual({ delivered: 0, failed: 0 });
    expect(await db.select().from(notifications)).toEqual([]);
  });
  it("reschedules the same pending row and never reopens delivered rows", async () => {
    const id = await db.transaction(tx => scheduleReminder(tx, input()));
    await db.transaction(tx => rescheduleReminders(tx, resource, { deliverAt: new Date(Date.now() + 86_400_000), body: "New time" }));
    expect(await processScheduledReminders()).toEqual({ delivered: 0, failed: 0 });
    await db.transaction(tx => rescheduleReminders(tx, resource, { deliverAt: new Date(Date.now() - 1000) }));
    expect(await processScheduledReminders()).toEqual({ delivered: 1, failed: 0 });
    expect(await db.select().from(scheduledReminders).where(eq(scheduledReminders.id, id))).toEqual([expect.objectContaining({ status: "delivered", body: "New time" })]);
    expect(await db.transaction(tx => rescheduleReminders(tx, resource, { deliverAt: new Date() }))).toEqual([]);
  });
  it("rejects conflicting keys and invalid instants without extra rows", async () => {
    const reminder = input();
    await db.transaction(tx => scheduleReminder(tx, reminder));
    await expect(db.transaction(tx => scheduleReminder(tx, { ...reminder, title: "Different" }))).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(db.transaction(tx => scheduleReminder(tx, { ...reminder, deliverAt: new Date("invalid") }))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await db.select().from(scheduledReminders)).toHaveLength(1);
  });
});
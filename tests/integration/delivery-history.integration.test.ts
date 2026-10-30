import { describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { CommandContext } from "@/domain/command-context";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const state = vi.hoisted(() => ({ tx: undefined as Transaction | undefined }));
vi.mock("@/db/client", () => ({
  get db() {
    if (!state.tx) throw new Error("Delivery history tests require the rollback transaction");
    return state.tx;
  },
}));

const integration = process.env.DATABASE_URL ? describe : describe.skip;
integration("recipient delivery history", () => {
  it("paginates exact database timestamps, isolates recipients and exposes only safe outcomes", async () => {
    const { db: database } = await vi.importActual<{ db: Database }>("@/db/client");
    const s = await import("@/db/schema");
    const { listDeliveryHistory } = await import("@/modules/communication/delivery-history.server");
    const rollback = new Error("rollback-delivery-history");
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    let checked = false;
    try {
      await database.transaction(async tx => {
        state.tx = tx;
        await tx.insert(s.people).values(ids.map(id => ({
          id, legalFirstName: "Synthetic", legalLastName: "DeliveryHistory",
        })));
        const owner: CommandContext = { actorPersonId: ids[0]!, capabilities: new Set(), scope: {} };
        const outsider: CommandContext = { ...owner, actorPersonId: ids[1]! };
        const [watch] = await tx.insert(s.subscriptions).values({
          subscriberPersonId: ids[0]!, eventTypes: ["AssignmentBecameMissing"],
          subjectType: "student_profile", subjectId: crypto.randomUUID(), channel: "email",
          status: "revoked",
        }).returning();
        const [otherWatch] = await tx.insert(s.subscriptions).values({
          subscriberPersonId: ids[1]!, eventTypes: ["AssignmentBecameMissing"],
          subjectType: "student_profile", subjectId: crypto.randomUUID(), channel: "sms",
        }).returning();
        if (!watch || !otherWatch) throw new Error("Missing watch fixtures");
        const [event] = await tx.insert(s.domainEvents).values({
          eventType: "AssignmentBecameMissing", aggregateType: "submission",
          aggregateId: crypto.randomUUID(), payload: { private: "Do not expose student content" },
        }).returning();
        if (!event) throw new Error("Missing event fixture");
        const outcomes = [
          { status: "pending", channel: "email", lastError: null, nextAttemptAt: new Date("2030-02-01") },
          { status: "processing", channel: "email", lastError: null, nextAttemptAt: null },
          { status: "delivered", channel: "email", lastError: null, nextAttemptAt: null },
          { status: "delivered", channel: "in_app", lastError: null, nextAttemptAt: null },
          { status: "delivered", channel: "sms", lastError: null, nextAttemptAt: null },
          { status: "suppressed", channel: "email", lastError: "authorization_failed", nextAttemptAt: null },
          { status: "suppressed", channel: "email", lastError: "condition_resolved", nextAttemptAt: null },
          { status: "suppressed", channel: "email", lastError: "watch_inactive", nextAttemptAt: null },
          { status: "failed", channel: "email", lastError: "no_active_email", nextAttemptAt: new Date("2030-02-01") },
          { status: "failed", channel: "sms", lastError: "sms_consent_required", nextAttemptAt: null },
          { status: "failed", channel: "agent_webhook", lastError: "channel_not_supported", nextAttemptAt: null },
          { status: "failed", channel: "email", lastError: "secret provider response", nextAttemptAt: null },
        ] satisfies Array<Pick<typeof s.subscriptionDeliveries.$inferInsert, "status" | "channel" | "lastError" | "nextAttemptAt">>;
        await tx.insert(s.subscriptionDeliveries).values(Array.from({ length: 31 }, (_, index) => ({
          ...outcomes[index % outcomes.length]!,
          subscriptionId: watch.id, domainEventId: event.id, kind: `reminder:${index + 1}`,
          attempts: 1, deliveredAt: outcomes[index % outcomes.length]!.status === "delivered" ? new Date("2030-01-01") : null,
        })));
        // Preserve PostgreSQL sub-millisecond precision at a page boundary.
        await tx.update(s.subscriptionDeliveries).set({
          createdAt: sql`'2030-01-01 12:00:00.123456+00'::timestamptz`,
        }).where(eq(s.subscriptionDeliveries.subscriptionId, watch.id));
        const [otherDelivery] = await tx.insert(s.subscriptionDeliveries).values({
          subscriptionId: otherWatch.id, domainEventId: event.id, channel: "sms", status: "failed",
        }).returning();
        if (!otherDelivery) throw new Error("Missing other delivery");

        const first = await listDeliveryHistory(owner);
        expect(first.items).toHaveLength(25);
        expect(first.nextCursor).toBeTruthy();
        const second = await listDeliveryHistory(owner, first.nextCursor!);
        expect(second.items).toHaveLength(6);
        expect(second.nextCursor).toBeNull();
        const combined = [...first.items, ...second.items];
        expect(new Set(combined.map(item => item.id)).size).toBe(31);
        expect(combined.some(item => item.id === otherDelivery.id)).toBe(false);
        expect(combined.find(item => item.channel === "in_app" && item.status === "delivered")?.label).toBe("Available in CAN");
        expect(combined.find(item => item.channel === "email" && item.status === "delivered")?.label).toBe("Accepted by provider");
        expect(combined.find(item => item.channel === "sms" && item.status === "delivered")?.label).toBe("Accepted by provider");
        expect(combined.find(item => item.status === "failed" && item.nextAttemptAt)?.label).toBe("Retry scheduled");
        expect(combined.some(item => item.detail.includes("no longer authorized"))).toBe(true);
        expect(combined.some(item => item.detail.includes("No active account email"))).toBe(true);
        expect(combined.some(item => item.detail.includes("verified phone"))).toBe(true);
        expect(JSON.stringify(combined)).not.toMatch(/secret provider|Do not expose|subscriptionId|domainEventId|subjectId|lastError/);
        expect(Object.keys(combined[0]!).sort()).toEqual([
          "id", "channel", "kind", "status", "label", "detail", "attempts", "createdAt", "acceptedAt", "nextAttemptAt",
        ].sort());
        expect((await listDeliveryHistory(outsider)).items.map(item => item.id)).toEqual([otherDelivery.id]);
        await expect(listDeliveryHistory(outsider, first.nextCursor!)).rejects.toThrow("unavailable");
        await expect(listDeliveryHistory({ ...owner, actorPersonId: null })).rejects.toThrow("authenticated delivery recipient");
        await expect(listDeliveryHistory(owner, crypto.randomUUID())).rejects.toThrow("unavailable");
        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      state.tx = undefined;
    }
    expect(checked).toBe(true);
    const remaining = await database.select({ id: s.people.id }).from(s.people).where(eq(s.people.id, ids[0]!));
    expect(remaining).toHaveLength(0);
  });
});

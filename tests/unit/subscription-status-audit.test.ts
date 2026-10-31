import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditEvents } from "@/db/schema";
import { setSubscriptionStatus } from "@/platform/subscriptions/matcher";

const state = vi.hoisted(() => ({
  current: undefined as { id: string; status: string } | undefined,
  inserted: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/db/client", () => ({
  db: {
    transaction: async (work: (tx: unknown) => unknown) =>
      work({
        select: () => ({
          from: () => ({
            where: () => ({ limit: async () => (state.current ? [state.current] : []) }),
          }),
        }),
        update: () => ({
          set: (values: Record<string, unknown>) => {
            state.updates.push(values);
            return { where: async () => [] };
          },
        }),
        insert: (table: unknown) => ({
          values: (values: Record<string, unknown>) => {
            state.inserted.push({ table, values });
            return { returning: async () => [{ id: "row-1" }] };
          },
        }),
      }),
  },
}));

beforeEach(() => {
  state.current = { id: "sub-1", status: "active" };
  state.inserted = [];
  state.updates = [];
});

describe("setSubscriptionStatus audit", () => {
  it("records a status-change audit row with before/after", async () => {
    const updated = await setSubscriptionStatus("sub-1", "person-1", "paused");
    expect(updated).toBe(true);
    expect(state.updates[0]).toMatchObject({ status: "paused" });
    const audit = state.inserted.find((row) => row.table === auditEvents);
    expect(audit?.values).toMatchObject({
      actorPersonId: "person-1",
      action: "subscription.status_changed",
      resourceType: "subscription",
      resourceId: "sub-1",
      before: { status: "active" },
      after: { status: "paused" },
    });
  });

  it("writes no audit row when the subscription is not found or not owned", async () => {
    state.current = undefined;
    const updated = await setSubscriptionStatus("sub-1", "person-2", "revoked");
    expect(updated).toBe(false);
    expect(state.updates).toEqual([]);
    expect(state.inserted).toEqual([]);
  });
});

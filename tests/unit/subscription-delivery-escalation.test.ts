import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect, type PgTable } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  record: {
    id: "delivery-1",
    status: "failed" as "failed" | "pending" | "delivered",
    nextAttemptAt: null as Date | null,
    lastError: "initial provider error" as string | null,
  },
  candidates: [] as Array<{ id: string; lastError: string | null }>,
  actions: [] as Array<Record<string, unknown>>,
  lockedQueries: [] as Array<{ sql: string; params: unknown[] }>,
  onTransaction: null as null | (() => void),
}));

vi.mock("@/db/client", () => {
  const dialect = new PgDialect();
  const select = () => {
    let tableName = "";
    let where: SQL;
    let locked = false;
    let limit = 100;
    const query = {
      from(table: PgTable) { tableName = getTableName(table); return query; },
      where(predicate: SQL) { where = predicate; return query; },
      limit(value: number) { limit = value; return query; },
      for() { locked = true; return query; },
      then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve().then(() => {
          if (tableName === "actions") return state.actions.slice(0, limit);
          if (tableName !== "subscription_deliveries")
            throw new Error("Unexpected select: " + tableName);
          if (!locked) return state.candidates.slice(0, limit);
          const rendered = dialect.sqlToQuery(where);
          state.lockedQueries.push(rendered);
          const current = state.record;
          const checksCurrentTerminal =
            rendered.params.includes("failed") &&
            /"status"\s*=/.test(rendered.sql) &&
            /"next_attempt_at"\s+is null/.test(rendered.sql);
          // SQL where terms are authoritative. A missing predicate must not
          // make this fake lock silently validate the implementation.
          if (!checksCurrentTerminal)
            throw new Error("Locked read must check current terminal status");
          return current.status === "failed" && current.nextAttemptAt === null
            ? [{ id: current.id, lastError: current.lastError }]
            : [];
        }).then(resolve, reject);
      },
    };
    return query;
  };
  const insert = (_table: PgTable) => ({
    async values(value: Record<string, unknown>) { state.actions.push(value); },
  });
  return { db: {
    select, insert,
    async transaction<T>(callback: (tx: {
      select: typeof select; insert: typeof insert;
    }) => Promise<T>): Promise<T> {
      state.onTransaction?.();
      return callback({ select, insert });
    },
  } };
});

import { escalateTerminalDeliveryFailures } from "@/platform/subscriptions/delivery-failure-actions";

beforeEach(() => {
  state.record = {
    id: "delivery-1", status: "failed", nextAttemptAt: null,
    lastError: "current provider error",
  };
  state.candidates = [{ id: "delivery-1", lastError: "stale provider error" }];
  state.actions = [];
  state.lockedQueries = [];
  state.onTransaction = null;
});

describe("terminal delivery escalation uses the current locked record", () => {
  it("creates one action from the current terminal reason", async () => {
    expect(await escalateTerminalDeliveryFailures()).toBe(1);
    expect(state.actions).toHaveLength(1);
    expect(state.actions[0]).toMatchObject({
      type: "outbound_notification_failed",
      subjectId: "delivery-1",
      description: "current provider error",
    });
    expect(state.lockedQueries).toHaveLength(1);
  });

  it("does not escalate when the delivery recovered after selection", async () => {
    state.onTransaction = () => {
      state.record.status = "delivered";
      state.record.lastError = null;
    };
    expect(await escalateTerminalDeliveryFailures()).toBe(0);
    expect(state.actions).toHaveLength(0);
  });

  it("does not escalate when a retry was scheduled after selection", async () => {
    state.onTransaction = () => {
      state.record.nextAttemptAt = new Date("2026-11-18T14:00:00Z");
    };
    expect(await escalateTerminalDeliveryFailures()).toBe(0);
    expect(state.actions).toHaveLength(0);
  });

  it("does not create a second action when one already exists", async () => {
    state.actions.push({
      id: "existing-action", subjectId: "delivery-1",
      type: "outbound_notification_failed",
    });
    expect(await escalateTerminalDeliveryFailures()).toBe(0);
    expect(state.actions).toHaveLength(1);
  });
});

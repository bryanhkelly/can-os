import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditEvents } from "@/db/schema";
import { getMyWatchDeliveries, updateWatchOptions } from "@/modules/conversation/ask-can.functions";
import { db } from "@/db/client";
import { setResponseHeader } from "@tanstack/react-start/server";

const state = vi.hoisted(() => ({
  updated: true as boolean,
  inserted: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    parse: (input: unknown) => input,
    validator(parse: (input: unknown) => unknown) {
      this.parse = parse;
      return this;
    },
    handler(callback: (input: { data: unknown }) => unknown) {
      return async (input: { data: unknown }) => callback({ data: this.parse(input.data) });
    },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("http://localhost"),
  setResponseHeader: vi.fn(),
}));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: async () => ({
    actorPersonId: "person-1",
    requestId: "req-1",
    role: "guardian",
    capabilities: new Set<string>(),
    scope: {},
  }),
}));
vi.mock("@/platform/agent", () => ({
  confirmRun: vi.fn(),
  getConversationMessages: vi.fn(),
  listConversations: vi.fn(),
  sendMessage: vi.fn(),
}));
vi.mock("@/platform/subscriptions", () => ({
  listSubscriptionsForPerson: vi.fn(),
  setSubscriptionStatus: vi.fn(),
}));
vi.mock("@/platform/subscriptions/preferences", () => ({
  beginSmsVerification: vi.fn(),
  confirmSmsVerification: vi.fn(),
  revokeSmsConsent: vi.fn(),
  updateQuietHours: vi.fn(),
  getNotificationPreferences: vi.fn(),
}));
vi.mock("@/db/client", () => ({
  db: {
    select: vi.fn(),
    transaction: async (work: (tx: unknown) => unknown) =>
      work({
        update: () => ({
          set: () => ({
            where: () => ({ returning: async () => (state.updated ? [{ id: "sub-1" }] : []) }),
          }),
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

const subscriptionId = "00000000-0000-4000-8000-0000000000bb";

beforeEach(() => {
  state.updated = true;
  state.inserted = [];
});

describe("updateWatchOptions audit", () => {
  it("audits delivery-option changes on an owned active watch", async () => {
    const result = await updateWatchOptions({
      data: {
        subscriptionId,
        channel: "email",
        remindAfterHours: 24,
        repeatEveryHours: null,
        maxReminders: 3,
      },
    } as never);
    expect(result).toEqual({ ok: true });
    const audit = state.inserted.find((row) => row.table === auditEvents);
    expect(audit?.values).toMatchObject({
      actorPersonId: "person-1",
      action: "subscription.options_updated",
      resourceType: "subscription",
      resourceId: subscriptionId,
      after: { channel: "email", reminderPolicy: { remindAfterHours: 24, maxReminders: 3 } },
    });

  });

  it("writes no audit row when the watch is not active or not owned", async () => {
    state.updated = false;
    await expect(
      updateWatchOptions({
        data: {
          subscriptionId,
          channel: "in_app",
          remindAfterHours: null,
          repeatEveryHours: null,
          maxReminders: 3,
        },
      } as never),
    ).rejects.toThrow("active watch");
    expect(state.inserted).toEqual([]);
  });
});

describe("individual watch delivery projection", () => {
  it("uses safe explanations and serialized retry timing without leaking provider diagnostics", async () => {
    const now = new Date("2030-01-01T12:00:00.000Z");
    const rows = [{
      id: "delivery", kind: "initial", channel: "sms", status: "failed", attempts: 1,
      lastError: "private provider diagnostic", nextAttemptAt: now, createdAt: now, deliveredAt: null,
    }];
    const query = { from: () => query, innerJoin: () => query, where: () => query,
      orderBy: () => query, limit: async () => rows };
    vi.mocked(db.select).mockReturnValueOnce(query as never);
    const result = await getMyWatchDeliveries({ data: { subscriptionId } });
    expect(result[0]).toMatchObject({
      label: "Retry scheduled", nextAttemptAt: now.toISOString(), createdAt: now.toISOString(),
    });
    expect(result[0]?.nextStep).toContain("worker will retry");
    expect(JSON.stringify(result)).not.toMatch(/lastError|private provider diagnostic/);
    expect(setResponseHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(state.inserted).toEqual([]);
  });
});

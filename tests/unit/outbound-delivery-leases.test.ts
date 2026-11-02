import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect, type PgTable } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  deliveries: [] as { id: string; status: string; leaseUntil: Date | null; attempts: number; nextAttemptAt: Date | null; channel: string }[],
  queries: [] as { sql: string; params: unknown[] }[],
  claimLimits: [] as number[],
  emailVerified: true,
  guardianAuthorized: true,
  renewAllowed: true,
  preferences: vi.fn(), email: vi.fn(), sms: vi.fn(),
}));

vi.mock("@/db/client", () => {
  const dialect = new PgDialect();
  const matches = (row: typeof state.deliveries[number], predicate: SQL) => {
    const query = dialect.sqlToQuery(predicate);
    state.queries.push(query);
    if (query.params.includes("pending")) {
      const dates = query.params.filter((value): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value));
      const now = new Date(dates[0]!);
      const excluded = query.params.filter(value => typeof value === "string" && value.startsWith("delivery"));
      return !excluded.includes(row.id) && (
        row.status === "pending" && (!row.nextAttemptAt || row.nextAttemptAt <= now) ||
        row.status === "failed" && !!row.nextAttemptAt && row.nextAttemptAt <= now ||
        row.status === "processing" && !!row.leaseUntil && row.leaseUntil <= now
      );
    }
    if (!query.params.includes(row.id)) return false;
    if (query.params.includes("processing") && row.status !== "processing") return false;
    const lease = query.sql.match(/"lease_until" = \$(\d+)/);
    if (lease && row.leaseUntil?.getTime() !== new Date(String(query.params[Number(lease[1]) - 1])).getTime()) return false;
    const expiry = query.sql.match(/"lease_until" > \$(\d+)/);
    if (expiry && (!state.renewAllowed || !row.leaseUntil || row.leaseUntil <= new Date(String(query.params[Number(expiry[1]) - 1])))) return false;
    return true;
  };
  const database = {
    transaction: async <T>(callback: (tx: typeof database) => Promise<T>): Promise<T> => callback(database),
    select: () => {
      let tableName = "", predicate: SQL, limit = 1000, joined = false, locked = false;
      const execute = () => {
        if (tableName === "subscription_deliveries" || tableName === "notification_outbound_deliveries") {
          if (locked && dialect.sqlToQuery(predicate).params.includes("pending")) state.claimLimits.push(limit);
          const rows = state.deliveries.filter(row => matches(row, predicate)).slice(0, limit);
          if (joined) return rows.map(delivery => ({
            delivery: { ...delivery },
            recipientPersonId: "person", notificationType: "school_family_alert", resourceType: "action",
            actionId: "action", actionType: "school_family_bulletin", title: "Notice", message: "School update",
            programId: "program", siteId: "site", organizationId: "school",
          }));
          return rows.map(row => ({ ...row, subscriptionId: "watch", domainEventId: "event" }));
        }
        if (tableName === "subscriptions") return [{ status: "active", subscriberPersonId: "person", sourceConversationId: null }];
        if (tableName === "domain_events") return [{ eventType: "AssignmentBecameMissing" }];
        if (tableName === "guardian_relationships") return state.guardianAuthorized ? [{ id: "relationship" }] : [];
        if (tableName === "account_person_grants") {
          const query = dialect.sqlToQuery(predicate);
          state.queries.push(query);
          return state.emailVerified || !query.sql.includes('"email_verified_at" is not null')
            ? [{ email: "guardian@example.org" }] : [];
        }
        throw new Error(`Unexpected selection: ${tableName}`);
      };
      return {
        from(table: PgTable) { tableName = getTableName(table); return this; },
        innerJoin() { joined = true; return this; },
        where(value: SQL) { predicate = value; return this; },
        orderBy() { return this; },
        limit(value: number) { limit = value; return this; },
        for() { locked = true; return this; },
        then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
          return Promise.resolve().then(execute).then(resolve, reject);
        },
      };
    },
    update: () => {
      let values: Record<string, unknown>, predicate: SQL;
      const execute = () => {
        const rows = state.deliveries.filter(row => matches(row, predicate));
        for (const row of rows) Object.assign(row, values);
        return rows.map(row => ({ id: row.id }));
      };
      return {
        set(value: Record<string, unknown>) { values = value; return this; },
        where(value: SQL) { predicate = value; return this; },
        returning: async () => execute(),
        then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
          return Promise.resolve().then(execute).then(resolve, reject);
        },
      };
    },
  };
  return { db: database };
});
vi.mock("@/platform/subscriptions/policy", () => ({
  getSubscriptionPolicy: () => ({
    load: async () => ({ organizationId: "school" }), organizationId: () => "school",
    authorize: async () => true, conditionHolds: async () => true, content: () => ({ title: "Reminder" }),
  }),
}));
vi.mock("@/modules/communication/notification-email.server", () => ({
  emailNotificationRecipients: async () => new Map([["person", "guardian@example.org"]]),
  sendNotificationEmail: state.email,
}));
vi.mock("@/platform/subscriptions/preferences", () => ({
  getNotificationPreferences: state.preferences, nextAllowedDelivery: () => null, sendOptedInSms: state.sms,
}));
import { processQueuedSubscriptionDeliveries } from "@/platform/subscriptions/delivery-worker";
import { processSchoolFamilyOutboundDeliveries } from "@/modules/communication/school-family-alert-delivery.server";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
  vi.clearAllMocks();
  state.deliveries = [];
  state.queries = []; state.claimLimits = [];
  state.emailVerified = true; state.guardianAuthorized = true; state.renewAllowed = true;
  state.preferences.mockResolvedValue(null);
  state.email.mockResolvedValue(true);
});
afterEach(() => vi.useRealTimers());
function arrange(count: number) {
  state.deliveries = Array.from({ length: count }, (_, index) => ({
    id: `delivery-${index}`, status: "pending", leaseUntil: null, attempts: 0, nextAttemptAt: null, channel: "email",
  }));
}

describe.each([
  { label: "subscriptions", worker: processQueuedSubscriptionDeliveries, batch: 1, delivered: "delivered" },
  { label: "school alerts", worker: processSchoolFamilyOutboundDeliveries, batch: 6, delivered: "accepted" },
])("$label delivery leases", ({ worker, batch, delivered }) => {
  it("claims only immediately processable work, using fresh time for later batches", async () => {
    arrange(batch + 1);
    state.email.mockImplementation(async () => {
      vi.setSystemTime(new Date(Date.now() + 30_000));
      return true;
    });
    expect(await worker(new Date(), batch + 1)).toBe(batch + 1);
    expect(state.claimLimits.every(limit => limit <= batch)).toBe(true);
    expect(state.deliveries.every(row => row.status === delivered && row.attempts === 1)).toBe(true);
    expect(state.queries.some(query => query.params.some(value =>
      typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) &&
      new Date(value).getTime() > new Date("2026-11-01T12:02:00Z").getTime()))).toBe(true);
  });
  it("does not send after losing its lease during recipient lookup", async () => {
    arrange(1);
    state.preferences.mockImplementation(async () => {
      state.deliveries[0]!.leaseUntil = new Date(Date.now() + 300_000);
      return null;
    });
    expect(await worker(new Date(), 1)).toBe(0);
    expect(state.email).not.toHaveBeenCalled();
    expect(state.deliveries[0]!.status).toBe("processing");
  });
  it("does not send after its unrenewed lease expires", async () => {
    arrange(1);
    state.preferences.mockImplementation(async () => {
      vi.setSystemTime(new Date(Date.now() + 121_000));
      return null;
    });
    expect(await worker(new Date(), 1)).toBe(0);
    expect(state.email).not.toHaveBeenCalled();
  });
  it.each([false, "throw"])("cannot overwrite a newer worker's success after stale provider result %s", async result => {
    arrange(1);
    state.email.mockImplementation(async () => {
      state.deliveries[0]!.status = delivered;
      state.deliveries[0]!.leaseUntil = null;
      state.deliveries[0]!.attempts = 2;
      if (result === "throw") throw new Error("late provider error");
      return false;
    });
    expect(await worker(new Date(), 1)).toBe(0);
    expect(state.deliveries[0]).toMatchObject({ status: delivered, attempts: 2, leaseUntil: null });
  });
  it("reclaims an expired abandoned lease", async () => {
    arrange(1);
    state.deliveries[0]!.status = "processing";
    state.deliveries[0]!.leaseUntil = new Date(Date.now() - 1);
    expect(await worker(new Date(), 1)).toBe(1);
    expect(state.deliveries[0]!.status).toBe(delivered);
  });
  it("does not let an overlapping invocation claim an active provider request", async () => {
    arrange(1);
    let notifyStarted!: () => void, finishSend!: (value: boolean) => void;
    const started = new Promise<void>(resolve => { notifyStarted = resolve; });
    const provider = new Promise<boolean>(resolve => { finishSend = resolve; });
    state.email.mockImplementation(() => { notifyStarted(); return provider; });
    const first = worker(new Date(), 1);
    await started;
    expect(await worker(new Date(), 1)).toBe(0);
    expect(state.email).toHaveBeenCalledOnce();
    finishSend(true);
    expect(await first).toBe(1);
    expect(state.deliveries[0]!.status).toBe(delivered);
  });
});
describe("school email ownership and relationship", () => {
  it("does not deliver school-authored email to an unverified email account", async () => {
    arrange(1); state.emailVerified = false;
    expect(await processSchoolFamilyOutboundDeliveries(new Date(), 1)).toBe(0);
    expect(state.email).not.toHaveBeenCalled();
    expect(state.deliveries[0]).toMatchObject({ status: "failed", nextAttemptAt: null });
  });
  it("preserves current guardian enrollment authorization", async () => {
    arrange(1); state.guardianAuthorized = false;
    expect(await processSchoolFamilyOutboundDeliveries(new Date(), 1)).toBe(0);
    expect(state.email).not.toHaveBeenCalled();
    expect(state.deliveries[0]!.status).toBe("suppressed");
  });
  it("does not make verified SMS consent depend on email verification", async () => {
    arrange(1); state.emailVerified = false;
    state.deliveries[0]!.channel = "sms";
    state.preferences.mockResolvedValue({
      smsOptedIn: true, smsVerifiedPhone: "+15555550123", smsVerifiedAt: new Date(),
    });
    state.sms.mockResolvedValue(true);
    expect(await processSchoolFamilyOutboundDeliveries(new Date(), 1)).toBe(1);
    expect(state.email).not.toHaveBeenCalled();
    expect(state.sms).toHaveBeenCalledOnce();
  });
});

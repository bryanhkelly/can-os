import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({ where: vi.fn(), transaction: vi.fn(), update: vi.fn() }));
vi.mock("@/db/client", () => {
  const chain = {
    select: () => chain, from: () => chain,
    where: mocks.where, orderBy: () => chain, limit: () => chain,
    for: async () => [],
  };
  mocks.where.mockImplementation(() => chain);
  return { db: {
    transaction: mocks.transaction.mockImplementation(callback => callback(chain)),
    update: mocks.update.mockImplementation(() => ({ set: () => ({ where: mocks.where }) })),
  } };
});
vi.mock("@/modules/learning/missing-assignment-event-handler", () => ({
  handleAcademicInterventionEvent: vi.fn(),
}));
vi.mock("@/modules/learning/academic-event-handler", () => ({
  handleAcademicPassThroughEvent: vi.fn(), handleGradePostedEvent: vi.fn(), handleSubmissionReceivedEvent: vi.fn(),
}));
vi.mock("@/platform/notifications/policy-handler", () => ({ handleNotificationPolicyEvent: vi.fn() }));
vi.mock("@/platform/subscriptions", () => ({ processEventSubscriptions: vi.fn() }));
vi.mock("@/modules/enrollment/family-invitations.server", () => ({ handleFamilyInvitationBatch: vi.fn() }));

import { processPendingDomainEvents } from "@/workers/domain-event-worker";

describe("exact-event worker selection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("limits both stale-lease recovery and pending claims to the selected IDs", async () => {
    const id = "f7300000-0000-4000-8000-000000000002";
    expect(await processPendingDomainEvents(10, { eventIds: [id] })).toBe(0);
    expect(mocks.where).toHaveBeenCalledTimes(2);
    for (const [condition] of mocks.where.mock.calls) {
      const query = new PgDialect().sqlToQuery(condition);
      expect(query.sql).toContain('"domain_events"."id" in');
      expect(query.params.filter(value => value === id)).toEqual([id]);
    }
  });

  it("does not turn an empty selection into an unscoped run", async () => {
    expect(await processPendingDomainEvents(10, { eventIds: [] })).toBe(0);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects malformed IDs before touching any events", async () => {
    await expect(processPendingDomainEvents(10, { eventIds: ["not-an-id"] })).rejects.toThrow();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("preserves the ordinary unscoped worker when no selection is provided", async () => {
    expect(await processPendingDomainEvents(10)).toBe(0);
    expect(mocks.where).toHaveBeenCalledTimes(2);
    for (const [condition] of mocks.where.mock.calls) {
      expect(new PgDialect().sqlToQuery(condition).sql).not.toContain('"domain_events"."id" in');
    }
  });
});

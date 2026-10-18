import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listStudyGroups } from "@/modules/study-groups/study-groups.functions";
import {
  decideCanonicalGroupConsent,
  decideCanonicalGroupMembership,
  requestCanonicalGroupMembership,
} from "@/modules/study-groups/canonical-membership.functions";

const { transaction, select, selectDistinct, insert, update, values, set, getCommandContext, requireActor, recordAudit } = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
  selectDistinct: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  values: vi.fn(),
  set: vi.fn(),
  getCommandContext: vi.fn(),
  requireActor: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("@/db/client", () => ({ db: { transaction, select, selectDistinct } }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: vi.fn(() => new Request("https://can.local")) }));
vi.mock("@/modules/identity/command-context.server", () => ({ getCommandContext }));
vi.mock("@/modules/identity/actors.server", () => ({
  requireActor,
  recordAudit,
  actorSiteIds: (actor: { scope?: { siteIds?: string[] } }) => actor.scope?.siteIds ?? [],
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator() { return this; },
    handler(callback: (input: unknown) => unknown) { return callback; },
  }),
}));

function query(data: unknown[]) {
  const result = Promise.resolve(data);
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    for: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(data),
    then: result.then.bind(result),
  };
}

const SITE = "f1000000-0000-4000-8000-000000000003";
const groupRow = { id: "group", title: "Group", siteId: SITE, programId: null, sectionId: null, maxMembers: 2, facilitatorPersonId: "facilitator", status: "active" };
const enrolledRow = [{ studentProfileId: "profile" }];
const guardianRow = [{ guardianPersonId: "guardian" }];

function actorFor(role: "student" | "teacher" | "guardian", actorPersonId: string) {
  return { accountId: "acct", sessionId: "sess", actorPersonId, role, scope: { siteIds: [SITE], programIds: [] } };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("CAN_DEMO_WRITES_ENABLED", "true");
  getCommandContext.mockResolvedValue({ actorPersonId: "student", role: "student", scope: { siteIds: [SITE] } });
  requireActor.mockResolvedValue(actorFor("student", "student"));
  recordAudit.mockResolvedValue(undefined);
  transaction.mockImplementation(async (callback) => callback({ select, insert, update }));
  insert.mockReturnValue({ values });
  values.mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "created" }]) });
  update.mockReturnValue({ set });
  set.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
});
afterEach(() => vi.unstubAllEnvs());

describe("canonical study group membership transitions", () => {
  it.each(["approved", "pending"])("preserves %s membership on repeated requests", async (status) => {
    const group = query([groupRow]);
    select.mockReturnValueOnce(group)
      .mockReturnValueOnce(query(enrolledRow))
      .mockReturnValueOnce(query(guardianRow))
      .mockReturnValueOnce(query([{ id: "membership", status }]));
    await expect(requestCanonicalGroupMembership({ data: { groupId: "group" } }))
      .resolves.toEqual({ membershipId: "membership", pending: status === "pending" });
    expect(group.for).toHaveBeenCalledWith("update");
    expect(insert).not.toHaveBeenCalled();
  });

  it("clears stale review metadata when a former member rejoins", async () => {
    select.mockReturnValueOnce(query([groupRow]))
      .mockReturnValueOnce(query(enrolledRow))
      .mockReturnValueOnce(query(guardianRow))
      .mockReturnValueOnce(query([{ id: "membership", status: "left" }]))
      .mockReturnValueOnce(query([]));
    await requestCanonicalGroupMembership({ data: { groupId: "group" } });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      status: "pending", reviewedByPersonId: null, joinedAt: null,
    }));
  });

  // K-12 fail-closed invariant: replaces the legacy path, which approved
  // guardianless students without any consent.
  it("fails closed when the student has no linked enrollment guardian", async () => {
    select.mockReturnValueOnce(query([groupRow]))
      .mockReturnValueOnce(query(enrolledRow))
      .mockReturnValueOnce(query([]));
    await expect(requestCanonicalGroupMembership({ data: { groupId: "group" } }))
      .rejects.toThrow("A linked guardian is required");
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses approval when no enrollment guardian can consent", async () => {
    requireActor.mockResolvedValue(actorFor("teacher", "teacher"));
    select.mockReturnValueOnce(query([{ ...groupRow, facilitatorPersonId: "teacher" }]))
      .mockReturnValueOnce(query([{ id: "membership", personId: "student", status: "pending" }]))
      .mockReturnValueOnce(query(enrolledRow))
      .mockReturnValueOnce(query([]));
    await expect(decideCanonicalGroupMembership({
      data: { groupId: "group", studentPersonId: "student", approve: true },
    })).rejects.toThrow("Guardian consent is required");
    expect(update).not.toHaveBeenCalled();
  });

  it("locks group capacity before refusing an over-capacity approval", async () => {
    requireActor.mockResolvedValue(actorFor("teacher", "teacher"));
    const group = query([{ ...groupRow, facilitatorPersonId: "teacher" }]);
    select.mockReturnValueOnce(group)
      .mockReturnValueOnce(query([{ id: "membership", personId: "student", status: "pending" }]))
      .mockReturnValueOnce(query(enrolledRow))
      .mockReturnValueOnce(query([{ personId: "guardian" }]))
      .mockReturnValueOnce(query([{ ownerPersonId: "guardian", status: "resolved",
        metadata: { studentPersonId: "student", membershipId: "membership", decision: "approve" } }]))
      .mockReturnValueOnce(query([{ signerPersonId: "guardian",
        evidence: { studentPersonId: "student", groupId: "group", decision: "approve", acknowledged: true } }]))
      .mockReturnValueOnce(query([{ total: 2 }]));
    await expect(decideCanonicalGroupMembership({
      data: { groupId: "group", studentPersonId: "student", approve: true },
    })).rejects.toThrow("full");
    expect(group.for).toHaveBeenCalledWith("update");
    expect(update).not.toHaveBeenCalled();
  });

  it("resolves a legacy consent action against the student's current pending membership", async () => {
    requireActor.mockResolvedValue(actorFor("guardian", "guardian"));
    select.mockReturnValueOnce(query([{ id: "action", subjectId: "group", ownerPersonId: "guardian",
      status: "open", metadata: { studentPersonId: "student", groupId: "group" } }]))
      .mockReturnValueOnce(query([{ id: "relationship" }]))
      .mockReturnValueOnce(query([groupRow]))
      .mockReturnValueOnce(query([{ id: "membership" }]))
      .mockReturnValueOnce(query(enrolledRow));
    const returning = vi.fn().mockResolvedValue([{ id: "consent" }]);
    values.mockReturnValue({ returning });
    await expect(decideCanonicalGroupConsent({
      data: { actionId: "action", approve: true, acknowledged: true },
    })).resolves.toEqual({ saved: true });
    expect(returning).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      status: "resolved",
      metadata: expect.objectContaining({
        membershipId: "membership", decision: "approve", consentRecordId: "consent",
      }),
    }));
  });

  it("marks a legacy consent action obsolete when no pending membership remains", async () => {
    requireActor.mockResolvedValue(actorFor("guardian", "guardian"));
    select.mockReturnValueOnce(query([{ id: "action", subjectId: "group", ownerPersonId: "guardian",
      status: "open", metadata: { studentPersonId: "student", groupId: "group" } }]))
      .mockReturnValueOnce(query([{ id: "relationship" }]))
      .mockReturnValueOnce(query([groupRow]))
      .mockReturnValueOnce(query([]));
    await expect(decideCanonicalGroupConsent({
      data: { actionId: "action", approve: true, acknowledged: true },
    })).resolves.toEqual({ saved: true, obsolete: true });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled" }));
    expect(insert).not.toHaveBeenCalled();
  });

  it("keeps authenticated group discovery available when demo writes are disabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CAN_DEMO_WRITES_ENABLED", "false");
    selectDistinct.mockReturnValueOnce(query([]));
    await expect(listStudyGroups()).resolves.toEqual([]);
  });

  it("requires an active enrollment before joining a group", async () => {
    select.mockReturnValueOnce(query([groupRow])).mockReturnValueOnce(query([]));
    await expect(requestCanonicalGroupMembership({ data: { groupId: "group" } }))
      .rejects.toThrow("active student program enrollment");
    expect(insert).not.toHaveBeenCalled();
  });
});
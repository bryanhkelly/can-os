import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decideStudyGroupMembership,
  listStudyGroups,
  requestStudyGroupMembership,
} from "@/modules/study-groups/study-groups.functions";

const { transaction, select, selectDistinct, insert, update, values, set, getCommandContext } = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
  selectDistinct: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  values: vi.fn(),
  set: vi.fn(),
  getCommandContext: vi.fn(),
}));

vi.mock("@/db/client", () => ({ db: { transaction, select, selectDistinct } }));
vi.mock("@tanstack/react-start/server", () => ({getRequest: vi.fn(() => new Request("https://can.local"))}));
vi.mock("@/modules/identity/command-context.server", () => ({getCommandContext}));
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
const groupRow = { id: "group", title: "Group", siteId: SITE, programId: null, maxMembers: 2, facilitatorPersonId: "facilitator" };
const enrolledRow = [{ id: "enrollment" }];
const schoolRow = [{ organizationId: "org" }];

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("CAN_DEMO_WRITES_ENABLED", "true");
  getCommandContext.mockResolvedValue({actorPersonId:"student",role:"student",scope:{siteIds:["f1000000-0000-4000-8000-000000000003"]}});
  transaction.mockImplementation(async (callback) => callback({ select, insert, update }));
  insert.mockReturnValue({ values });
  values.mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) });
  update.mockReturnValue({ set });
  set.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
});
afterEach(() => vi.unstubAllEnvs());

describe("synthetic Study Group membership transitions", () => {
  it.each(["approved", "pending"])("preserves %s membership on repeated requests", async (status) => {
    const group = query([groupRow]);
    select.mockReturnValueOnce(group)
      .mockReturnValueOnce(query(enrolledRow))
      .mockReturnValueOnce(query(schoolRow))
      .mockReturnValueOnce(query([{ status }]));
    await expect(requestStudyGroupMembership({ data: { groupId: "group" } })).resolves.toEqual({ ok: true });
    expect(group.for).toHaveBeenCalledWith("update");
    expect(insert).not.toHaveBeenCalled();
  });

  it("clears stale review metadata when a former member rejoins", async () => {
    select.mockReturnValueOnce(query([groupRow]))
      .mockReturnValueOnce(query(enrolledRow))
      .mockReturnValueOnce(query(schoolRow))
      .mockReturnValueOnce(query([{ status: "left" }]))
      .mockReturnValueOnce(query([]));
    const conflict = vi.fn().mockResolvedValue(undefined);
    values.mockReturnValue({ onConflictDoUpdate: conflict });
    await requestStudyGroupMembership({ data: { groupId: "group" } });
    expect(conflict).toHaveBeenCalledWith(expect.objectContaining({
      set: expect.objectContaining({ status: "pending", reviewedByPersonId: null, joinedAt: null }),
    }));
  });

  it("locks group capacity before refusing an over-capacity approval", async () => {
    getCommandContext.mockResolvedValue({actorPersonId:"teacher",role:"teacher",scope:{siteIds:[SITE]}});
    const group = query([{ ...groupRow, facilitatorPersonId: "teacher" }]);
    select.mockReturnValueOnce(group)
      .mockReturnValueOnce(query([{ id: "membership" }]))
      .mockReturnValueOnce(query(enrolledRow))
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([{ total: 2 }]));
    await expect(decideStudyGroupMembership({
      data: { groupId: "group", personId: "student", approve: true },
    })).rejects.toThrow("full");
    expect(group.for).toHaveBeenCalledWith("update");
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps authenticated group discovery available when demo writes are disabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CAN_DEMO_WRITES_ENABLED", "false");
    selectDistinct.mockReturnValueOnce(query([]));
    await expect(listStudyGroups()).resolves.toEqual([]);
  });

  it("requires an active enrollment before joining a group", async () => {
    select.mockReturnValueOnce(query([groupRow])).mockReturnValueOnce(query([]));
    await expect(requestStudyGroupMembership({ data: { groupId: "group" } }))
      .rejects.toThrow("active enrollment required");
    expect(insert).not.toHaveBeenCalled();
  });
});

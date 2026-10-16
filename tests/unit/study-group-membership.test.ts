import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decideStudyGroupMembership,
  listStudyGroups,
  requestStudyGroupMembership,
} from "@/modules/student-experience/study-groups.functions";

const { transaction, select, insert, update, values, set, getCommandContext } = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  values: vi.fn(),
  set: vi.fn(),
  getCommandContext: vi.fn(),
}));

vi.mock("@/db/client", () => ({ db: { transaction } }));
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
    where: vi.fn().mockReturnThis(),
    for: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(data),
    then: result.then.bind(result),
  };
}

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
    const group = query([{ id: "group" }]);
    select.mockReturnValueOnce(group).mockReturnValueOnce(query([{ status }]));
    await expect(requestStudyGroupMembership({ data: { groupId: "group" } })).resolves.toEqual({ ok: true });
    expect(group.for).toHaveBeenCalledWith("update");
    expect(insert).not.toHaveBeenCalled();
  });

  it("clears stale review metadata when a former member rejoins", async () => {
    select.mockReturnValueOnce(query([{ id: "group" }])).mockReturnValueOnce(query([{ status: "left" }]));
    const conflict = vi.fn().mockResolvedValue(undefined);
    values.mockReturnValue({ onConflictDoUpdate: conflict });
    await requestStudyGroupMembership({ data: { groupId: "group" } });
    expect(conflict).toHaveBeenCalledWith(expect.objectContaining({
      set: expect.objectContaining({ status: "pending", reviewedByPersonId: null, joinedAt: null }),
    }));
  });

  it("locks group capacity before refusing an over-capacity approval", async () => {
    getCommandContext.mockResolvedValue({actorPersonId:"teacher",role:"teacher",scope:{siteIds:["f1000000-0000-4000-8000-000000000003"]}});
    const group = query([{ id: "group", maxMembers: 2 }]);
    select.mockReturnValueOnce(group)
      .mockReturnValueOnce(query([{ id: "membership" }]))
      .mockReturnValueOnce(query([{ total: 2 }]));
    await expect(decideStudyGroupMembership({
      data: { groupId: "group", personId: "student", approve: true },
    })).rejects.toThrow("full");
    expect(group.for).toHaveBeenCalledWith("update");
    expect(update).not.toHaveBeenCalled();
  });

  it("denies reads and writes before querying the database when explicitly disabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CAN_DEMO_WRITES_ENABLED", "false");
    await expect(listStudyGroups()).rejects.toThrow("disabled");
    await expect(requestStudyGroupMembership({ data: { groupId: "group" } })).rejects.toThrow("disabled");
    expect(transaction).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });
});

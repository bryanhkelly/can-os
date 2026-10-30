import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  record: {} as Record<string, unknown>, update: vi.fn(), audit: vi.fn(), notify: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ validator: () => ({ handler: (fn: unknown) => fn }), handler: (fn: unknown) => fn }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => ({}), setResponseHeader: vi.fn() }));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: async () => ({ role: "teacher", actorPersonId: "teacher",
    capabilities: new Set(["assignments:grade"]), scope: { sectionIds: ["section"] } }),
}));
vi.mock("@/modules/learning/class-access.server", () => ({
  authorizeClass: vi.fn(async () => ({})), accessibleClasses: vi.fn(),
}));
vi.mock("@/platform/mutation", () => ({ writeAudit: state.audit, notify: state.notify, emitEvent: vi.fn() }));
vi.mock("@/db/client", () => {
  function query(rows: unknown[]) {
    const chain: Record<string, unknown> = {};
    for(const method of ["from", "innerJoin", "where", "for", "limit", "orderBy"])
      chain[method] = () => chain;
    chain.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve);
    return chain;
  }
  return { db: {
    select: () => query([{ sectionId: "section" }]),
    transaction: async (fn: (tx: unknown) => unknown) => {
      let index=0;
      const rows = [[state.record], [{id:"membership"}], [{id:"submission"}]];
      return fn({
        select: () => query(rows[index++] ?? []),
        update: state.update,
      });
    },
  } };
});
import { returnSubmissionForRevision } from "@/modules/learning/gradebook.functions";
beforeEach(() => {
  vi.clearAllMocks();
  state.record = { id:"submission", status:"graded", assessmentStatus:"published",
    sectionId:"section", sectionActive:true, availableAt:null, closesAt:null,
    studentProfileId:"student", studentPersonId:"person", assessmentId:"assessment",
    attemptNumber:1, siteId:"site", programId:"program", schoolYearId:"year" };
  state.update.mockReturnValue({ set: () => ({ where: () => ({
    returning: async () => [{id:"submission"}],
  }) }) });
});
const invoke = () => (returnSubmissionForRevision as unknown as (arg: unknown) => Promise<unknown>)({
  data:{submissionId:"submission"},
});
describe("usable teacher revision return", () => {
  it.each(["closed", "unreleased"])("does not notify a student to revise %s work", async reason => {
    if(reason==="closed") state.record.closesAt = new Date(Date.now()-60000);
    else state.record.availableAt = new Date(Date.now()+60000);
    await expect(invoke()).rejects.toThrow(reason==="closed" ? "closed" : "not been released");
    expect(state.update).not.toHaveBeenCalled();
    expect(state.notify).not.toHaveBeenCalled();
  });
  it("permits overdue published work without a close date", async () => {
    await expect(invoke()).resolves.toEqual({submissionId:"submission"});
    expect(state.update).toHaveBeenCalledOnce();
    expect(state.audit).toHaveBeenCalledOnce();
    expect(state.notify).toHaveBeenCalledOnce();
  });
});

describe("teacher revision attempt limit",()=>{
 it("does not return a final permitted attempt or send an unusable revision notice",async()=>{
  state.record.metadata={maxAttempts:1};
  await expect(invoke()).rejects.toThrow("attempt limit");
  expect(state.update).not.toHaveBeenCalled();
  expect(state.notify).not.toHaveBeenCalled();
 });
});

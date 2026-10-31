import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  results: [] as unknown[][],
  authorize: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ validator: () => ({ handler: (fn: unknown) => fn }), handler: (fn: unknown) => fn }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => ({}), setResponseHeader: vi.fn() }));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: async () => ({ role:"teacher",actorPersonId:"teacher",
    capabilities:new Set(["assignments:grade"]),scope:{sectionIds:["section"]} }),
}));
vi.mock("@/modules/learning/class-access.server", () => ({
  authorizeClass: state.authorize, accessibleClasses: vi.fn(),
}));
vi.mock("@/db/client", () => ({
  db: { select: () => {
    const rows=state.results.shift()??[];
    const chain:Record<string,unknown>={};
    for(const name of ["from","innerJoin","where","limit","orderBy"])chain[name]=()=>chain;
    chain.then=(resolve:(rows:unknown[])=>unknown)=>Promise.resolve(rows).then(resolve);
    return chain;
  } },
}));
import { getSubmissionReview } from "@/modules/learning/gradebook.functions";
const invoke = () => (getSubmissionReview as unknown as (arg:unknown)=>Promise<unknown>)({
  data:{submissionId:"previous-attempt"},
});
beforeEach(()=>{
  vi.clearAllMocks();
  state.authorize.mockResolvedValue({});
  state.results=[
    [{sectionId:"section"}],
    [{id:"previous-attempt",assessmentId:"assessment",studentProfileId:"student",
      studentPersonId:"person",response:{text:"Earlier reasoning"},attemptNumber:1,
      submittedAt:new Date("2026-10-20"),status:"returned",score:"6",
      feedback:{comment:"Explain the comparison"}}],
    [{id:"latest-attempt",attemptNumber:2,status:"submitted",submittedAt:new Date("2026-10-29"),score:null},
      {id:"previous-attempt",attemptNumber:1,status:"returned",submittedAt:new Date("2026-10-20"),score:"6"}],
  ];
});
describe("teacher review of previous submission evidence",()=>{
  it("returns that attempt's own response, grade and feedback under current Section authority",async()=>{
    await expect(invoke()).resolves.toMatchObject({
      attemptNumber:1,responseText:"Earlier reasoning",score:"6",feedbackComment:"Explain the comparison",
      attachments:[],attempts:[{id:"latest-attempt"},{id:"previous-attempt"}],
    });
    expect(state.authorize).toHaveBeenCalledWith(expect.objectContaining({role:"teacher"}),"section");
  });
  it("reauthorizes history after a teacher's Section authority is revoked",async()=>{
    state.authorize.mockRejectedValue(new Error("delegation revoked"));
    await expect(invoke()).rejects.toThrow("delegation revoked");
    expect(state.results).toHaveLength(2);
  });
});

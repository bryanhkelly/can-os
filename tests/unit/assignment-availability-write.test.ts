import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ assessment: {} as Record<string, unknown>, latest: null as Record<string, unknown> | null, files:[] as {storageKey:string}[], writes: vi.fn(), values:{} as Record<string,unknown> }));
vi.mock("@/platform/mutation",()=>({emitEvent:vi.fn(),writeAudit:vi.fn()}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ validator: () => ({ handler: (handler: unknown) => handler }), handler: (handler: unknown) => handler }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => ({}) }));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: async () => ({ role: "student", actorPersonId: "person",
    capabilities: new Set(["assignments:submit"]), scope: { siteIds: ["site"], programIds: ["program"] } }),
}));
vi.mock("@/modules/learning/class-access.server", () => ({
  authorizeClass: async () => ({ studentProfileId: "student" }), accessibleClasses: async () => [],
}));
vi.mock("@/modules/learning/gradebook.functions", () => ({
  createAssessment: vi.fn(), gradeSubmission: vi.fn(), manageAssessment: vi.fn(), returnSubmissionForRevision: vi.fn(),
}));
vi.mock("@/db/client", () => {
  let reads = 0;
  const query = () => {
    const readIndex = reads++;
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "innerJoin", "where", "orderBy"]) chain[method] = () => chain;
    chain.limit = () => readIndex===0 ? Promise.resolve([state.assessment])
      : readIndex===1 ? { for: async () => state.latest ? [state.latest] : [] } : Promise.resolve(state.files);
    chain.then=(resolve:(rows:unknown[])=>unknown)=>Promise.resolve([]).then(resolve);
    return chain;
  };
  return { db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "student" }] }) }) }),
    transaction: async (fn: (tx: unknown) => unknown) => { reads = 0; return fn({
      select: query, execute: async () => {}, insert: state.writes, update: state.writes,
    }); },
  } };
});
import { saveAssignmentDraft, saveAssignmentResponse } from "@/modules/student-experience/assignments.functions";
beforeEach(() => {
  vi.clearAllMocks();
  state.latest = null;
  state.files=[];state.values={};
  state.assessment = { id: "assessment", sectionId: "section", status: "published",
    availableAt: null, closesAt: null, metadata: {} };
});

describe("submitting a completed worksheet file",()=>{
 const documentId="10000000-0000-4000-8000-000000000001";
 const invoke=()=> (saveAssignmentResponse as unknown as (arg:unknown)=>Promise<unknown>)({data:{assessmentId:"assessment",text:""}});
 it("submits the current verified file without requiring filler text and retains its receipt",async()=>{
  state.latest={id:"worksheet-attempt",status:"assigned",attemptNumber:1,response:{attachments:[documentId]}};
  state.files=[{storageKey:"learning/assignment/assessment/file"}];
  state.writes.mockReturnValue({set:(values:Record<string,unknown>)=>{state.values=values;return {where:()=>({returning:async()=>[{id:"worksheet-attempt"}]})};}});
  await expect(invoke()).resolves.toEqual({submissionId:"worksheet-attempt"});
  expect(state.values).toMatchObject({status:"submitted",response:{text:"",attachments:[documentId]}});
  state.latest={...state.latest,status:"submitted",response:state.values.response};
  await expect(invoke()).resolves.toEqual({submissionId:"worksheet-attempt"});
  expect(state.writes).toHaveBeenCalledOnce();
 });
 it.each(["empty","unverified","previous-attempt"])("rejects %s evidence without submitting",async(kind)=>{
  if(kind!=="empty")state.latest={id:"attempt",status:kind==="previous-attempt"?"returned":"assigned",attemptNumber:1,response:{attachments:[documentId]}};
  await expect(invoke()).rejects.toThrow("attach a verified");
  expect(state.writes).not.toHaveBeenCalled();
 });
});
describe("student write availability", () => {
  for (const [name, fn] of [["draft", saveAssignmentDraft], ["submission", saveAssignmentResponse]] as const) {
    it.each(["unreleased", "closed"])("blocks " + name + " when %s before changing attempts", async reason => {
      if (reason === "unreleased") state.assessment.availableAt = new Date(Date.now() + 60000);
      else state.assessment.closesAt = new Date(Date.now() - 60000);
      await expect((fn as unknown as (arg: unknown) => Promise<unknown>)({
        data: { assessmentId: "assessment", text: "My revised answer" },
      })).rejects.toThrow(reason === "unreleased" ? "not been released" : "closed");
      expect(state.writes).not.toHaveBeenCalled();
    });
  }
});


describe("submission retry receipts", () => {
  it("returns the original receipt without modifying an accepted attempt", async () => {
    state.latest = { id: "original-receipt", status: "submitted", response: { text: "Final answer" } };
    const invoke = saveAssignmentResponse as unknown as (arg: unknown) => Promise<unknown>;
    await expect(invoke({ data: { assessmentId: "assessment", text: " Final answer " } }))
      .resolves.toEqual({ submissionId: "original-receipt" });
    expect(state.writes).not.toHaveBeenCalled();
  });
  it("allows the submission coordinator to retry its identical draft step", async () => {
    state.latest = { id: "original-receipt", status: "submitted", response: { text: "Final answer" } };
    const invoke = saveAssignmentDraft as unknown as (arg: unknown) => Promise<unknown>;
    await expect(invoke({ data: { assessmentId: "assessment", text: "Final answer" } }))
      .resolves.toEqual({ saved: true });
    expect(state.writes).not.toHaveBeenCalled();
  });
  it.each([saveAssignmentDraft, saveAssignmentResponse])("rejects a changed response after submission", async fn => {
    state.latest = { id: "original-receipt", status: "submitted", response: { text: "Final answer" } };
    const invoke = fn as unknown as (arg: unknown) => Promise<unknown>;
    await expect(invoke({ data: { assessmentId: "assessment", text: "Different answer" } }))
      .rejects.toThrow(/overwritten|editable/);
    expect(state.writes).not.toHaveBeenCalled();
  });
});

describe("student revision attempt limits",()=>{
 it.each([saveAssignmentDraft,saveAssignmentResponse])("rejects a next attempt beyond the stored assessment limit",async fn=>{
  state.assessment.metadata={maxAttempts:2};
  state.latest={id:"returned",status:"returned",attemptNumber:2,response:{text:"Prior work"}};
  const invoke=fn as unknown as (arg:unknown)=>Promise<unknown>;
  await expect(invoke({data:{assessmentId:"assessment",text:"A third attempt"}})).rejects.toThrow("attempt limit");
  expect(state.writes).not.toHaveBeenCalled();
 });
});

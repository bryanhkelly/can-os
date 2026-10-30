import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/domain/command-context";
const state = vi.hoisted(() => ({
  classes:vi.fn(), authority:vi.fn(), resolve:vi.fn(), selects:vi.fn(),
  rows:[] as unknown[],
}));
vi.mock("@tanstack/react-start",()=>({
  createServerFn:()=>({validator:()=>({handler:(fn:unknown)=>fn}),handler:(fn:unknown)=>fn}),
}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>({}),setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/command-context.server",()=>({
  getCommandContext:async()=>({role:"teacher",actorPersonId:"instructor",
    capabilities:new Set(["teacher:read","action.resolve"]),scope:{sectionIds:["section"]}}),
}));
vi.mock("@/modules/learning/class-access.server",()=>({accessibleClasses:state.classes}));
vi.mock("@/modules/actions/academic-action-policy.server",()=>({assertAcademicActionAuthority:state.authority}));
vi.mock("@/modules/actions/resolve-action",()=>({resolveActionInTransaction:state.resolve}));
vi.mock("@/db/client",()=>{
  const tx={select:()=>{
    state.selects();
    const chain:Record<string,unknown>={};
    for(const method of ["from","innerJoin","where","orderBy","limit","for"])chain[method]=()=>chain;
    chain.then=(resolve:(rows:unknown[])=>unknown)=>Promise.resolve(state.rows).then(resolve);
    return chain;
  }};
  return {db:{transaction:async(fn:(tx:unknown)=>unknown)=>fn(tx)}};
});
import { getTeacherGradeResponses, resolveTeacherGradeResponse } from "@/modules/learning/teacher-grade-response.functions";
const action={id:"guardian-action",type:"guardian_grade_follow_up",sectionId:"section",
  subjectId:"student",status:"open",resolutionNote:null,metadata:{requestMessage:"Explain the rubric, please."}};
beforeEach(()=>{
  vi.clearAllMocks();
  state.classes.mockResolvedValue([{id:"section"}]);
  state.authority.mockResolvedValue(undefined);
  state.rows=[{action,studentName:"Student One",assessmentId:"assessment",assessmentTitle:"Essay"}];
});
describe("teacher guardian-question workflow",()=>{
  it("returns no questions without a currently authorized teaching Section",async()=>{
    state.classes.mockResolvedValue([]);
    await expect(getTeacherGradeResponses()).resolves.toEqual({items:[],truncated:false});
    expect(state.selects).not.toHaveBeenCalled();
  });
  it("supports an institution teacher with only delegated Section scope",async()=>{
    await expect(getTeacherGradeResponses()).resolves.toMatchObject({
      items:[{id:"guardian-action",studentProfileId:"student",message:"Explain the rubric, please."}],
    });
    expect(state.authority).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({
      scope:{sectionIds:["section"]},
    }),action);
  });
  it("filters questions after current student or academic authority is lost",async()=>{
    state.authority.mockRejectedValue(new AuthorizationError("student enrollment"));
    await expect(getTeacherGradeResponses()).resolves.toEqual({items:[],truncated:false});
  });
  it("never resolves an unrelated Action through the grade-question command",async()=>{
    state.rows=[{id:"unrelated",type:"academic_intervention"}];
    const invoke=resolveTeacherGradeResponse as unknown as (arg:unknown)=>Promise<unknown>;
    await expect(invoke({data:{actionId:"unrelated",response:"This is a school response."}})).rejects.toThrow("guardian grade follow-up");
    expect(state.resolve).not.toHaveBeenCalled();
  });
  it("hands the exact selected Action and response to the canonical resolver",async()=>{
    state.rows=[{id:"guardian-action",type:"guardian_grade_follow_up"}];
    const invoke=resolveTeacherGradeResponse as unknown as (arg:unknown)=>Promise<unknown>;
    await expect(invoke({data:{actionId:"guardian-action",response:"Here is the explanation."}})).resolves.toEqual({saved:true});
    expect(state.resolve).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({actorPersonId:"instructor"}),
      {actionId:"guardian-action",resolutionNote:"Here is the explanation."});
  });
});

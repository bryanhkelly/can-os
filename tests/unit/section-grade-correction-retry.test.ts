import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({
  results:[] as unknown[][],update:vi.fn(),audit:vi.fn(),event:vi.fn(),notify:vi.fn(),authority:vi.fn(),values:[] as unknown[],
}));
vi.mock("@tanstack/react-start",()=>({
  createServerFn:()=>({validator:()=>({handler:(fn:unknown)=>fn}),handler:(fn:unknown)=>fn}),
}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>({}),setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/command-context.server",()=>({
  getCommandContext:async()=>({role:"teacher",actorPersonId:"teacher",capabilities:new Set(["assignments:grade"]),
    scope:{sectionIds:["section"]}}),
}));
vi.mock("@/modules/learning/class-access.server",()=>({authorizeClass:state.authority}));
vi.mock("@/modules/programs/program-site-authorization.server",()=>({requireInstitutionalAcademicProgramAuthority:vi.fn()}));
vi.mock("@/platform/mutation",()=>({writeAudit:state.audit,emitEvent:state.event,notifyMany:state.notify}));
vi.mock("@/db/client",()=>({db:{transaction:async(fn:(tx:unknown)=>unknown)=>fn({
  select:()=>{
    const rows=state.results.shift()??[];
    const chain:Record<string,unknown>={};
    for(const method of ["from","innerJoin","where","limit","for"])chain[method]=()=>chain;
    chain.then=(resolve:(rows:unknown[])=>unknown)=>Promise.resolve(rows).then(resolve);
    return chain;
  },
  update:state.update,
})}}));
import { correctSectionGrade } from "@/modules/learning/report-cards.functions";
const grade={id:"grade",sectionId:"section",studentProfileId:"student",gradingPeriodId:"period",
  termId:"term",status:"finalized",percentage:"84.00",letterGrade:"B",gradeScaleId:"scale",
  correctionOfId:"grade",metadata:{corrections:[{reason:"First correction"}]}};
beforeEach(()=>{
  vi.clearAllMocks();state.values=[];
  state.authority.mockResolvedValue({});
  state.results=[[grade],[{id:"section",siteId:"site",programId:"program",title:"Math"}],
    [{configuration:{entries:[{label:"B",minPercent:80,maxPercent:89.99},{label:"A",minPercent:90,maxPercent:100}]}}],
    [{personId:"student-person"}],[]];
  state.update.mockImplementation(()=>({set:(value:unknown)=>{
    state.values.push(value);return {where:async()=>{}};
  }}));
});
const invoke=(percentage:number)=> (correctSectionGrade as unknown as (arg:unknown)=>Promise<unknown>)({
  data:{sectionGradeId:"grade",percentage,reason:"Verified scoring correction"},
});
describe("finalized grade correction retries",()=>{
  it("treats numerically equal values as a no-op after current authority checks",async()=>{
    await expect(invoke(84)).resolves.toEqual({corrected:false});
    expect(state.authority).toHaveBeenCalledOnce();
    expect(state.update).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
    expect(state.event).not.toHaveBeenCalled();
    expect(state.notify).not.toHaveBeenCalled();
  });
  it("never lets an identical request bypass revoked teaching authority",async()=>{
    state.authority.mockRejectedValue(new Error("delegation revoked"));
    await expect(invoke(84)).rejects.toThrow("delegation revoked");
    expect(state.update).not.toHaveBeenCalled();
  });
  it("keeps genuine corrections audited with the previous values preserved",async()=>{
    await expect(invoke(92)).resolves.toEqual({corrected:true});
    expect(state.values[0]).toMatchObject({percentage:"92",letterGrade:"A",
      metadata:{corrections:[{reason:"First correction"},expect.objectContaining({
        previousPercentage:"84.00",previousLetterGrade:"B",
      })]}});
    expect(state.audit).toHaveBeenCalledOnce();
    expect(state.event).toHaveBeenCalledOnce();
    expect(state.notify).toHaveBeenCalledOnce();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({rows:[] as unknown[][],members:vi.fn(),writes:vi.fn()}));
vi.mock("@tanstack/react-start",()=>({
 createServerFn:()=>({validator:()=>({handler:(fn:unknown)=>fn}),handler:(fn:unknown)=>fn}),
}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>({}),setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/command-context.server",()=>({
 getCommandContext:async()=>({role:"teacher",actorPersonId:"teacher",
  capabilities:new Set(["assignments:grade"]),scope:{sectionIds:["11111111-1111-4111-8111-111111111111"]}}),
}));
vi.mock("@/modules/learning/current-section-enrollment.server",()=>({currentSectionStudentIds:state.members}));
vi.mock("@/modules/learning/class-access.server",()=>({authorizeClass:vi.fn()}));
vi.mock("@/modules/programs/program-site-authorization.server",()=>({requireInstitutionalAcademicProgramAuthority:vi.fn()}));
vi.mock("@/platform/mutation",()=>({writeAudit:vi.fn(),emitEvent:vi.fn(),notifyMany:vi.fn()}));
vi.mock("@/db/client",()=>({db:{transaction:async(fn:(tx:unknown)=>unknown)=>fn({
 execute:vi.fn(),
 select:()=>{
  const rows=state.rows.shift()??[];
  const chain:Record<string,unknown>={};
  for(const method of ["from","innerJoin","where","limit","orderBy","for"])chain[method]=()=>chain;
  chain.then=(resolve:(rows:unknown[])=>unknown)=>Promise.resolve(rows).then(resolve);
  return chain;
 },insert:state.writes,update:state.writes,
})}}));
import { finalizeSectionGrades } from "@/modules/learning/report-cards.functions";
const sectionId="11111111-1111-4111-8111-111111111111";
const periodId="22222222-2222-4222-8222-222222222222";
beforeEach(()=>{
 vi.clearAllMocks();
 state.members.mockResolvedValue(["already-finalized","no-submission","ungraded"]);
 state.rows=[
  [{id:sectionId,programId:"program",termId:"term",siteId:"site"}],
  [{id:periodId,termId:"term",schoolYearId:"year",gradeScaleId:"scale",startsOn:"2026-10-01",endsOn:"2026-10-31"}],
  [{configuration:{entries:[{label:"A",minPercent:90,maxPercent:100}]}}],
  [{timezone:"America/Los_Angeles"}], // School-local grading date.
  [{id:"assessment",title:"Essay",pointsPossible:"10"}],
  [{assessmentId:"assessment",studentProfileId:"already-finalized",attemptNumber:1,score:"10",status:"graded"}],
  [], // Builder for the correlated latest-attempt NOT EXISTS subquery.
  [{id:"grade",studentProfileId:"already-finalized",status:"finalized"}],
 ];
});
const invoke=()=> (finalizeSectionGrades as unknown as (arg:unknown)=>Promise<unknown>)({
 data:{sectionId,gradingPeriodId:periodId},
});
describe("grading-period finalization receipts",()=>{
 it("previews exact unfinished work without writing grades",async()=>{
  state.rows.push([{id:"no-submission",firstName:"Ada",lastName:"Lovelace",preferredName:null},
    {id:"ungraded",firstName:"Grace",lastName:"Hopper",preferredName:null}]);
  (state.rows[5] as Record<string,unknown>[]).push({assessmentId:"assessment",studentProfileId:"ungraded",attemptNumber:2,score:null,status:"submitted"});
  const result=await (finalizeSectionGrades as unknown as (arg:unknown)=>Promise<unknown>)({data:{sectionId,gradingPeriodId:periodId,previewOnly:true}});
  expect(result).toEqual({preview:true,eligible:0,blockers:[
    {studentProfileId:"no-submission",studentName:"Ada Lovelace",assessmentId:"assessment",assessmentTitle:"Essay",status:"not_started"},
    {studentProfileId:"ungraded",studentName:"Grace Hopper",assessmentId:"assessment",assessmentTitle:"Essay",status:"submitted"},
  ]});
  expect(state.writes).not.toHaveBeenCalled();
 });
 it("accounts for every active learner, including those with no graded work",async()=>{
  await expect(invoke()).resolves.toEqual({finalized:0,skipped:3});
  expect(state.writes).not.toHaveBeenCalled();
 });
 it("returns every learner as skipped when the period has no scoreable work",async()=>{
  state.rows[4]=[];
  await expect(invoke()).resolves.toEqual({finalized:0,skipped:3});
  expect(state.writes).not.toHaveBeenCalled();
 });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  rows: [] as unknown[][], actor: {} as unknown, ready: vi.fn(), insert: vi.fn(), update: vi.fn(),
}));
vi.mock("@/db/client", () => {
  const select = () => {
    const rows = state.rows.shift() ?? [];
    const chain = { from:()=>chain, innerJoin:()=>chain, where:()=>chain, for:()=>chain,
      limit:async()=>rows, then:(resolve: (rows: unknown[])=>unknown)=>Promise.resolve(rows).then(resolve) };
    return chain;
  };
  return { db: { select, transaction:async(callback:(tx:unknown)=>unknown)=>callback({select,insert:state.insert,update:state.update}) } };
});
vi.mock("@/db/schema", () => Object.fromEntries([
  "accessAccounts","accountPersonGrants","applications","enrollments","guardianRelationships","people",
  "programs","sections","studentAccessConsents","studentProfiles","terms",
].map(name=>[name,Object.fromEntries(["id","programId","studentProfileId","stage","metadata","status","personId",
  "siteId","organizationId","schoolYearId","sectionId","termId","kind","active","guardianPersonId",
  "studentPersonId","canManageEnrollment","studentEmail"].map(key=>[key,name+"."+key]))])));
vi.mock("@tanstack/react-start",()=>({createServerFn:()=>({
  validator(){return this;},handler(callback:unknown){return callback;},
})}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>new Request("https://school.example.test"),setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/command-context.server",()=>({getCommandContext:async()=>state.actor}));
vi.mock("@/domain/access-tokens",()=>({normalizeAccessEmail:(email:string)=>email.trim().toLowerCase()}));
vi.mock("@/modules/enrollment/instructional-section-readiness.server",()=>({staffedPublishedSectionIds:state.ready}));
vi.mock("@/modules/identity/passwordless-access.server",()=>({requestOneTimeAccess:vi.fn()}));
vi.mock("@/platform/mutation",()=>({emitEvent:vi.fn(),writeAudit:vi.fn()}));
vi.mock("@/domain/event-types",()=>({EventTypes:{}}));
import { consentToStudentLearningAccount, getStudentLearningHandoff } from "@/modules/enrollment/student-access-handoff.functions";
const app={id:"application",programId:"program",studentProfileId:"profile",stage:"accepted",
  applicationMetadata:{schoolYearId:"intended-year"},programStatus:"active",
  studentPersonId:"student",siteId:"site",organizationId:"church"};
const section={id:"section",sectionProgramId:"program",sectionSiteId:"site",
  sectionYearId:"intended-year",enrollmentYearId:"intended-year"};
beforeEach(()=>{
  vi.clearAllMocks();
  state.actor={actorPersonId:"guardian",role:"guardian",accountId:"account",capabilities:new Set(["enrollment.apply"]),
    scope:{programIds:["program"],siteIds:["site"],organizationIds:["church"]}};
  state.rows=[[app],[{canManage:true,metadata:{verification:"verified"}}],
    [{schoolYearId:"intended-year"}],[section],[{status:"pending_review",studentEmail:"child@example.test"}]];
  state.ready.mockImplementation(async(ids:string[])=>new Set(ids));
});
describe("student access uses the accepted application's Program and year",()=>{
  it("retains handoff for the current active Program and intended year",async()=>{
    expect(await getStudentLearningHandoff({data:{applicationId:"application"}})).toEqual({
      status:"pending_review",studentEmail:"child@example.test",blocker:null,
    });
    expect(state.ready).toHaveBeenCalledWith(["section"],expect.anything());
  });
  it("denies consent before writes when the Program is no longer active",async()=>{
    for(const programStatus of ["paused","suspended","closed"]){
      state.rows=[[{...app,programStatus}]];
      await expect(consentToStudentLearningAccount({data:{
        applicationId:"application",studentEmail:"child@example.test",acknowledged:true,
      }})).rejects.toThrow("active school Program");
    }
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
    expect(state.ready).not.toHaveBeenCalled();
  });
  it("does not use another year's active class to authorize this application",async()=>{
    state.rows=[[app],[{canManage:true,metadata:{verification:"verified"}}],[{schoolYearId:"other-year"}],[{...section,sectionYearId:"other-year",enrollmentYearId:"other-year"}]];
    expect(await getStudentLearningHandoff({data:{applicationId:"application"}})).toMatchObject({status:"blocked",blocker:{code:"placement_missing"}});
    expect(state.ready).not.toHaveBeenCalled();
  });
  it("denies an application without active Program enrollment",async()=>{
    state.rows=[[app],[{canManage:true,metadata:{verification:"verified"}}],[]];
    expect(await getStudentLearningHandoff({data:{applicationId:"application"}})).toMatchObject({status:"blocked",blocker:{code:"enrollment_missing"}});
    expect(state.ready).not.toHaveBeenCalled();
  });
  it("preserves legacy applications without an intended-year snapshot",async()=>{
    state.rows=[[{...app,applicationMetadata:{}}],[{canManage:true,metadata:{verification:"verified"}}],
      [{schoolYearId:"intended-year"}],[section],[]];
    expect(await getStudentLearningHandoff({data:{applicationId:"application"}})).toEqual({status:"not_requested",studentEmail:null,blocker:null});
  });
  it("explains current classroom readiness without marking the student ready",async()=>{
    state.ready.mockResolvedValue(new Set());
    expect(await getStudentLearningHandoff({data:{applicationId:"application"}})).toMatchObject({
      status:"blocked",studentEmail:null,blocker:{code:"classroom_not_ready",target:"academic_setup",programId:"program"},
    });
  });
  it("denies an unrelated school before exposing a readiness blocker",async()=>{
    state.actor={actorPersonId:"registrar",role:"registrar",capabilities:new Set(["enrollment.activate"]),
      scope:{organizationIds:["church"],siteIds:["other"],programIds:["program"]}};
    state.rows=[[{...app,programStatus:"paused"}]];
    await expect(getStudentLearningHandoff({data:{applicationId:"application"}})).rejects.toThrow("school membership");
    expect(state.ready).not.toHaveBeenCalled();
  });
  it("denies an unverified family relationship before exposing readiness",async()=>{
    state.rows=[[{...app,programStatus:"paused"}],[{canManage:true,metadata:{verification:"pending"}}]];
    await expect(getStudentLearningHandoff({data:{applicationId:"application"}})).rejects.toThrow("verified family relationship");
    expect(state.ready).not.toHaveBeenCalled();
  });
});

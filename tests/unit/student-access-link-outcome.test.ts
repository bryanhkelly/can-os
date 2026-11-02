import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({
 rows:[] as unknown[][],actor:{} as unknown,inTransaction:false,committed:false,
 sender:vi.fn(),update:vi.fn(),insert:vi.fn(),emit:vi.fn(),audit:vi.fn(),transactions:vi.fn(),
}));
vi.mock("@/db/client",()=>{
 const select=()=>{
  const rows=state.rows.shift()??[];
  const chain={from:()=>chain,innerJoin:()=>chain,where:()=>chain,for:()=>chain,
   limit:async()=>rows,then:(resolve:(rows:unknown[])=>unknown)=>Promise.resolve(rows).then(resolve)};
  return chain;
 };
 return {db:{select,transaction:async(callback:(tx:unknown)=>unknown)=>{
  state.transactions();state.inTransaction=true;
  try{const result=await callback({select,insert:state.insert,update:state.update});state.committed=true;return result;}
  finally{state.inTransaction=false;}
 }}};
});
vi.mock("@/db/schema",()=>Object.fromEntries([
 "accessAccounts","accountPersonGrants","applications","enrollments","guardianRelationships","people",
 "programs","sections","studentAccessConsents","studentProfiles","terms",
].map(name=>[name,Object.fromEntries(["id","programId","studentProfileId","stage","metadata","status","personId",
 "siteId","organizationId","schoolYearId","sectionId","termId","kind","active","guardianPersonId",
 "studentPersonId","canManageEnrollment","studentEmail","emailNormalized","disabled","accountId","email","role"]
 .map(key=>[key,name+"."+key]))])));
vi.mock("@tanstack/react-start",()=>({createServerFn:()=>({validator(){return this;},handler(callback:unknown){return callback;}})}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>new Request("https://school.example.test"),setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/command-context.server",()=>({getCommandContext:async()=>state.actor}));
vi.mock("@/domain/access-tokens",()=>({normalizeAccessEmail:(email:string)=>email.trim().toLowerCase()}));
vi.mock("@/modules/enrollment/instructional-section-readiness.server",()=>({staffedPublishedSectionIds:async(ids:string[])=>new Set(ids)}));
vi.mock("@/modules/identity/passwordless-access.server",()=>({requestOneTimeAccess:state.sender}));
vi.mock("@/platform/mutation",()=>({emitEvent:state.emit,writeAudit:state.audit,notify:vi.fn()}));
vi.mock("@/domain/event-types",()=>({EventTypes:{StudentLearningAccessApproved:"StudentLearningAccessApproved"}}));
import { provisionStudentLearningAccess } from "@/modules/enrollment/student-access-handoff.functions";
const input={applicationId:"application",confirmedIndependentIdentity:true as const,reviewMethod:"institutional_school_record" as const};
function rows(status="pending_review",grants=[{personId:"student",role:"student",isSynthetic:false}]){
 state.rows=[
  [{id:"application",programId:"program",studentProfileId:"profile",stage:"accepted",
   applicationMetadata:{schoolYearId:"year"},programStatus:"active",studentPersonId:"student",
   siteId:"site",organizationId:"church"}],
  [{schoolYearId:"year"}],
  [{id:"section",sectionProgramId:"program",sectionSiteId:"site",sectionYearId:"year",enrollmentYearId:"year"}],
  [{id:"consent",status,studentProfileId:"profile",programId:"program",siteId:"site",
   guardianPersonId:"guardian",studentEmail:"child@example.test"}],
  [{permission:true,metadata:{verification:"verified"}}],
  [{active:true,email:"child@example.test"}],
  [{id:"account",disabled:false}],grants,[{id:"grant",active:true}],
 ];
}
beforeEach(()=>{
 vi.clearAllMocks();state.committed=false;state.inTransaction=false;
 state.actor={actorPersonId:"registrar",role:"registrar",accountId:"operator-account",sessionId:"session",
  capabilities:new Set(["enrollment.activate"]),scope:{programIds:["program"],siteIds:["site"],organizationIds:["church"]}};
 rows();
 state.update.mockImplementation(()=>({set:()=>({where:async()=>undefined})}));
 state.sender.mockImplementation(async()=>{
  expect(state.inTransaction).toBe(false);expect(state.committed).toBe(true);
  return {accepted:true};
 });
});
describe("student approval and sign-in request outcomes",()=>{
 it("reports the generic request result separately after approval commits",async()=>{
  expect(await provisionStudentLearningAccess({data:input})).toEqual({status:"approved",signInRequest:"requested"});
  expect(state.emit).toHaveBeenCalledTimes(1);
  expect(state.update).toHaveBeenCalledTimes(1);
 });
 it("keeps the saved approval when the link request throws",async()=>{
  state.sender.mockRejectedValue(new Error("provider unavailable"));
  expect(await provisionStudentLearningAccess({data:input})).toEqual({status:"approved",signInRequest:"failed"});
  expect(state.committed).toBe(true);
  expect(state.emit).toHaveBeenCalledTimes(1);
  expect(state.update).toHaveBeenCalledTimes(1);
 });
 it("retries an approved student's link without another approval event or update",async()=>{
  rows("approved");
  expect(await provisionStudentLearningAccess({data:{applicationId:"application"}}))
   .toEqual({status:"approved",signInRequest:"requested"});
  expect(state.emit).not.toHaveBeenCalled();
  expect(state.update).not.toHaveBeenCalled();
  expect(state.sender).toHaveBeenCalledWith("child@example.test");
 });
 it("does not convert an identity collision into a delivery warning",async()=>{
  rows("pending_review",[{personId:"another-person",role:"student",isSynthetic:false}]);
  await expect(provisionStudentLearningAccess({data:input})).rejects.toThrow("different identity");
  expect(state.committed).toBe(false);
  expect(state.sender).not.toHaveBeenCalled();
  expect(state.emit).not.toHaveBeenCalled();
 });
 it("retains the registrar capability boundary before any transaction or mail",async()=>{
  state.actor={actorPersonId:"guardian",role:"guardian",capabilities:new Set(["enrollment.activate"])};
  await expect(provisionStudentLearningAccess({data:input})).rejects.toThrow("real school registrar");
  expect(state.transactions).not.toHaveBeenCalled();
  expect(state.sender).not.toHaveBeenCalled();
 });
});

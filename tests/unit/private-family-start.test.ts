import {beforeEach,describe,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({authority:vi.fn(),published:vi.fn(),issue:vi.fn(),rows:[] as any[],locks:[] as unknown[]}));
vi.mock("@/db/schema",()=>Object.fromEntries(["communicationThreads","domainEvents","programs","publicAdmissionsInterests","sites"]
 .map(name=>[name,new Proxy({name},{get:(t,key)=>key==="name"?t.name:String(key)})])));
vi.mock("@/modules/programs/program-site-authorization.server",()=>({requireChurchHostedOperatingServices:state.authority}));
vi.mock("@/modules/enrollment/public-family-start.server",()=>({
 resolvePublishedFamilyStartDestination:state.published,requestVerifiedFamilyStart:state.issue,
}));
vi.mock("@/domain/access-tokens",()=>({normalizeAccessEmail:(value:string)=>value.trim().toLowerCase()}));
vi.mock("@/domain/event-types",()=>({EventTypes:{PublicFamilyStartRequested:"family.requested"}}));
import {requestConsentedInterestFamilyStart,requestInvitedFamilyStart,resolvePrivateFamilyStartDestination,resolveRedeemedFamilyStartDestination} from "../../src/modules/enrollment/private-family-start.server";
const programId="22222222-2222-4222-8222-222222222222";
const siteId="33333333-3333-4333-8333-333333333333";
const recipientKey="44444444-4444-4444-8444-444444444444";
const batchId="55555555-5555-4555-8555-555555555555";
const school={programId,siteId,programName:"School",organizationId:"org",programOrganizationId:"org",slug:"school",type:"church_hosted_academy",status:"active"};
const batch={contextId:programId,metadata:{kind:"family_invitation_batch",version:1,batchRequestId:batchId,
 siteSlug:"school",siteId,destination:"private_platform",introduction:"Welcome",status:"queued",
 recipients:[{key:recipientKey,firstName:"First",lastName:"Family",email:"parent@example.test",status:"queued",attempts:0}]}};
const intent={id:"intent",programId,siteId,email:"parent@example.test"};
function reader(){
 const chain:any={from:()=>chain,innerJoin:()=>chain,where:()=>chain,
  for:(_mode:unknown,options:unknown)=>{state.locks.push(options);return chain;},limit:async()=>state.rows.shift()??[]};
 return {select:()=>chain} as any;
}
beforeEach(()=>{vi.clearAllMocks();state.rows=[];state.locks=[];state.authority.mockResolvedValue({});});
describe("private family invitation destination",()=>{
 it("uses academic authority independently of public publication",async()=>{
  state.rows=[[school]];
  expect(await resolvePrivateFamilyStartDestination(reader(),programId)).toMatchObject({programId,siteId});
  expect(state.authority).toHaveBeenCalledWith(expect.anything(),programId,["admissions","school_of_record"]);
  expect(state.published).not.toHaveBeenCalled();
  expect(state.locks[0]).toEqual({of:[expect.anything(),expect.anything()]});
 });
 it.each([null,{...school,status:"paused"},{...school,status:"launching"},{...school,type:"after_school_enrichment"},{...school,programOrganizationId:"other"}])("denies an unavailable or mismatched academic application",async row=>{
  state.rows=[row?[row]:[]];
  await expect(resolvePrivateFamilyStartDestination(reader(),programId)).rejects.toThrow("not open");
 });
 it("retains current institutional denial",async()=>{
  state.rows=[[school]];state.authority.mockRejectedValue(new Error("Authorization suspended"));
  await expect(resolvePrivateFamilyStartDestination(reader(),programId)).rejects.toThrow("suspended");
 });
 it("issues through the shared challenge service without fabricating adult consent",async()=>{
  state.rows=[[batch],[school]];
  state.issue.mockImplementation(prepare=>prepare(reader()));
  const prepared=await requestInvitedFamilyStart(batchId,recipientKey,vi.fn());
  expect(prepared).toMatchObject({school:{programId,siteId},contact:{email:intent.email},
   evidence:{source:"staff_invitation",invitationBatchId:batchId,recipientKey}});
  expect(prepared.contact).not.toHaveProperty("contactConsent");
 });
 it("requires a canonical invitation recipient before issuance",async()=>{
  state.rows=[[batch]];state.issue.mockImplementation(prepare=>prepare(reader()));
  await expect(requestInvitedFamilyStart(batchId,"unknown",vi.fn())).rejects.toThrow("recipient");
 });
 it("keeps legacy/public redemption behind public publication checks",async()=>{
  state.rows=[[]];state.published.mockResolvedValue(school);
  await resolveRedeemedFamilyStartDestination(reader(),intent);
  expect(state.published).toHaveBeenCalledWith(expect.anything(),programId);
 });
 it("rechecks original private destination and current authority at redemption",async()=>{
  state.rows=[[{payload:{source:"staff_invitation",invitationBatchId:batchId,recipientKey}}],[batch],[school]];
  expect(await resolveRedeemedFamilyStartDestination(reader(),intent)).toMatchObject({programId,siteId});
  expect(state.published).not.toHaveBeenCalled();
 });
 it.each([{email:"other@example.test"},{programId:"other"},{siteId:"other"}])("denies changed recipient or destination",async change=>{
  state.rows=[[{payload:{source:"staff_invitation",invitationBatchId:batchId,recipientKey}}],[batch],[school]];
  await expect(resolveRedeemedFamilyStartDestination(reader(),{...intent,...change})).rejects.toThrow("original private");
 });
 it("allows a consented pre-opening family to receive the private application link",async()=>{
  const interest={id:"interest",programId,siteId,status:"new",consentAt:new Date(),
    firstName:"First",lastName:"Family",email:intent.email};
  state.rows=[[interest],[school]];state.issue.mockImplementation(prepare=>prepare(reader()));
  const prepared=await requestConsentedInterestFamilyStart(interest.id,vi.fn());
  expect(prepared).toMatchObject({
   school:{programId,siteId},contact:{email:intent.email},
   evidence:{source:"consented_interest",interestId:interest.id},
  });
  expect(state.published).not.toHaveBeenCalled();
 });
 it("denies invited follow-up when consent was not personally recorded",async()=>{
  state.rows=[[{id:"interest",programId,siteId,status:"new",consentAt:null}]];
  state.issue.mockImplementation(prepare=>prepare(reader()));
  await expect(requestConsentedInterestFamilyStart("interest",vi.fn())).rejects.toThrow("consented");
 });
 it("revalidates the consent, email and Program when the link is redeemed",async()=>{
  const interest={programId,siteId,status:"contacted",consentAt:new Date(),email:intent.email};
  state.rows=[[{payload:{source:"consented_interest",interestId:"interest"}}],[interest],[school]];
  expect(await resolveRedeemedFamilyStartDestination(reader(),intent)).toMatchObject({programId,siteId});
  expect(state.published).not.toHaveBeenCalled();
 });
 it("denies a closed family interest even when an email link was already issued",async()=>{
  state.rows=[[{payload:{source:"consented_interest",interestId:"interest"}}],
    [{programId,siteId,status:"closed",consentAt:new Date(),email:intent.email}]];
  await expect(resolveRedeemedFamilyStartDestination(reader(),intent)).rejects.toThrow("original consented");
 });
 it("does not accept missing private issuance provenance",async()=>{
  state.rows=[[{payload:{source:"staff_invitation"}}]];
  await expect(resolveRedeemedFamilyStartDestination(reader(),intent)).rejects.toThrow("provenance");
 });
});

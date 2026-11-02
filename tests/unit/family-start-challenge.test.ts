import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({transaction:vi.fn(),audit:vi.fn(),event:vi.fn(),insert:vi.fn(),rows:[] as unknown[][]}));
vi.mock("@/db/client",()=>({db:{transaction:state.transaction}}));
vi.mock("@/db/schema",()=>Object.fromEntries(["programs","programPublications","publicFamilyStartRequests","sitePublications","sites"].map(name=>[name,new Proxy({name},{get:(t,key)=>String(key)})])));
vi.mock("@/domain/access-tokens",()=>({hashAccessSecret:()=>"hash",issueOpaqueSecret:()=>"single-use-secret"}));
vi.mock("@/domain/public-family-start",()=>({publicFamilyStartInput:{},verifiedFamilyStartEmail:vi.fn()}));
vi.mock("@/modules/identity/resend-access-mail.server",()=>({sendAccessLinkViaResend:vi.fn()}));
vi.mock("@/modules/programs/program-site-authorization.server",()=>({requireChurchHostedOperatingServices:vi.fn()}));
vi.mock("@/platform/mutation",()=>({writeAudit:state.audit,emitEvent:state.event}));
vi.mock("@/domain/event-types",()=>({EventTypes:{PublicFamilyStartRequested:"family.requested"}}));
import {requestVerifiedFamilyStart} from "../../src/modules/enrollment/public-family-start.server";
const preparation={school:{programId:"program",siteId:"site",organizationId:"org",programName:"School"},
 contact:{programId:"program",firstName:"First",lastName:"Family",email:"parent@example.test"},
 evidence:{source:"staff_invitation" as const,invitationBatchId:"batch",recipientKey:"recipient"}};
beforeEach(()=>{
 vi.clearAllMocks();state.rows=[];
 vi.stubEnv("CAN_ACCESS_PUBLIC_ORIGIN","https://app.example.test");
 vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER","synthetic-pepper-at-least-thirty-two-characters");
 const chain:any={from:()=>chain,where:()=>chain,limit:async()=>state.rows.shift()??[]};
 const tx={select:()=>chain,execute:vi.fn(),insert:state.insert};
 state.insert.mockReturnValue({values:()=>({returning:async()=>[{id:"intent"}]})});
 state.transaction.mockImplementation(run=>run(tx));
});
afterEach(()=>vi.unstubAllEnvs());
describe("shared family email challenge",()=>{
 it("persists original invitation evidence and emails only the single-use platform link",async()=>{
  const sender=vi.fn();
  expect(await requestVerifiedFamilyStart(async()=>preparation,sender,{idempotencyKey:"batch:recipient"}))
   .toEqual({requestId:"intent",created:true});
  expect(sender).toHaveBeenCalledWith(expect.objectContaining({to:"parent@example.test",
   accessUrl:"https://app.example.test/family/join#token=single-use-secret",idempotencyKey:"batch:recipient"}));
  expect(state.event).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({payload:{status:"pending_email_verification",...preparation.evidence}}));
  expect(JSON.stringify(state.event.mock.calls)).not.toContain("parent@example.test");
 });
 it("reuses the canonical cooldown without sending a second email",async()=>{
  state.rows=[[{id:"prior"}]];const sender=vi.fn();
  expect(await requestVerifiedFamilyStart(async()=>preparation,sender)).toEqual({requestId:"prior",created:false});
  expect(state.insert).not.toHaveBeenCalled();expect(sender).not.toHaveBeenCalled();
 });
 it("does not create a challenge when current destination authorization fails",async()=>{
  const sender=vi.fn();
  await expect(requestVerifiedFamilyStart(async()=>{throw new Error("Authorization suspended");},sender)).rejects.toThrow("suspended");
  expect(state.insert).not.toHaveBeenCalled();expect(sender).not.toHaveBeenCalled();
 });
 it("rejects an insecure verification origin before preparing identities",async()=>{
  vi.stubEnv("CAN_ACCESS_PUBLIC_ORIGIN","http://app.example.test");const prepare=vi.fn();
  await expect(requestVerifiedFamilyStart(prepare,vi.fn())).rejects.toThrow("HTTPS platform origin");
  expect(prepare).not.toHaveBeenCalled();
 });
});

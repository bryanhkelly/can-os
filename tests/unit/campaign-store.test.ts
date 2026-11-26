import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const mocked=vi.hoisted(()=>({
 execute:vi.fn(),txExecute:vi.fn(),transaction:vi.fn(),resolve:vi.fn(),
}));
vi.mock("@/db/client",()=>({db:{execute:mocked.execute,transaction:mocked.transaction}}));
vi.mock("@/modules/engagement/engagement-go.server",()=>({resolveGoExperience:mocked.resolve}));
import {processEngagementCampaignDeliveries} from "@/modules/communication/campaign-store.server";

const work={id:"11111111-1111-4111-8111-111111111111",lease_id:"22222222-2222-4222-8222-222222222222",email:"synthetic@real.org",
 unsubscribe_token:"33333333-3333-4333-8333-333333333333",attempts:1,outcome_unconfirmed:false,first_attempt_at:new Date().toISOString(),
 subject:"QA invitation",body:"Synthetic fixture",public_url:"https://qa.example.org/go/abcdefghijkl",
 sender_from:"qa@real.org",sender_address:"QA mailing address",sender_scope:"organization:qa",organization_id:"qa",code:"abcdefghijkl",cancelled_at:null};
function claim(recipient=work.email){mocked.txExecute.mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{...work,email:recipient}]});}
beforeEach(()=>{
 vi.resetAllMocks();
 mocked.transaction.mockImplementation(async (run:(tx:{execute:typeof mocked.txExecute})=>unknown)=>run({execute:mocked.txExecute}));
 mocked.resolve.mockResolvedValue({mode:"page"});
 vi.stubEnv("CAN_CAMPAIGN_FROM_EMAIL",work.sender_from);vi.stubEnv("CAN_CAMPAIGN_POSTAL_ADDRESS",work.sender_address);
 vi.stubEnv("CAN_ACCESS_PUBLIC_ORIGIN","https://qa.example.org");vi.stubEnv("RESEND_API_KEY","mock-only");
 vi.stubEnv("RESEND_WEBHOOK_SECRET","mock-only");
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe("campaign worker fenced delivery",()=>{
 it("counts provider acceptance only after its own fenced settlement",async()=>{
  claim();mocked.execute.mockResolvedValueOnce({rows:[{eligible:true}]}).mockResolvedValueOnce({rows:[{id:work.id,status:"accepted",outcome_unconfirmed:false}]});
  const send=vi.fn(async()=>new Response(JSON.stringify({id:"receipt"}),{status:200}));vi.stubGlobal("fetch",send);
  expect(await processEngagementCampaignDeliveries(1)).toEqual({accepted:1,failed:0,suppressed:0,retry:0,unconfirmed:0});
  expect(send).toHaveBeenCalledWith("https://api.resend.com/emails",expect.objectContaining({redirect:"error",headers:expect.objectContaining({"Idempotency-Key":"engagement-campaign/"+work.id})}));
 });
 it("suppresses demo destinations without provider calls",async()=>{
  claim("participant@nested.school.demo");
  mocked.execute.mockResolvedValueOnce({rows:[{id:work.id,status:"suppressed",outcome_unconfirmed:false}]});
  const send=vi.fn();vi.stubGlobal("fetch",send);
  expect((await processEngagementCampaignDeliveries(1)).suppressed).toBe(1);
  expect(send).not.toHaveBeenCalled();
 });
 it("does not count acceptance after a webhook or another worker has settled the lease",async()=>{
  claim();mocked.execute.mockResolvedValueOnce({rows:[{eligible:true}]}).mockResolvedValueOnce({rows:[]});
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({id:"receipt"}),{status:200})));
  expect(await processEngagementCampaignDeliveries(1)).toEqual({accepted:0,failed:0,suppressed:0,retry:0,unconfirmed:0});
 });
 it("never sends a recipient who is no longer eligible",async()=>{
  claim();mocked.execute.mockResolvedValueOnce({rows:[{eligible:false}]}).mockResolvedValueOnce({rows:[{id:work.id,status:"suppressed",outcome_unconfirmed:false}]});
  const send=vi.fn();vi.stubGlobal("fetch",send);
  expect((await processEngagementCampaignDeliveries(1)).suppressed).toBe(1);expect(send).not.toHaveBeenCalled();
 });
 it("preserves earlier uncertainty when a later attempt is suppressed",async()=>{
  claim();mocked.execute.mockResolvedValueOnce({rows:[{eligible:false}]}).mockResolvedValueOnce({rows:[{id:work.id,status:"failed",outcome_unconfirmed:true}]});
  const send=vi.fn();vi.stubGlobal("fetch",send);
  expect((await processEngagementCampaignDeliveries(1)).unconfirmed).toBe(1);expect(send).not.toHaveBeenCalled();
 });
 it("preserves retryable provider uncertainty without counting delivery",async()=>{
  claim();mocked.execute.mockResolvedValueOnce({rows:[{eligible:true}]}).mockResolvedValueOnce({rows:[{id:work.id,status:"pending",outcome_unconfirmed:false}]});
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(null,{status:429})));
  expect(await processEngagementCampaignDeliveries(1)).toEqual({accepted:0,failed:0,suppressed:0,retry:1,unconfirmed:0});
 });
 it("preserves an unconfirmed attempt when HTTP success has no usable receipt", async () => {
  claim();
  mocked.execute.mockResolvedValueOnce({ rows: [{ eligible: true }] })
   .mockResolvedValueOnce({ rows: [{ id: work.id, status: "pending", outcome_unconfirmed: true }] });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "" }), { status: 200 })));
  expect(await processEngagementCampaignDeliveries(1)).toEqual({
   accepted: 0, failed: 0, suppressed: 0, retry: 1, unconfirmed: 0,
  });
  expect(mocked.execute).toHaveBeenCalledTimes(2);
 });

 it.each([429, 503])("stops claiming additional work after HTTP %i", async status => {
  claim();
  mocked.execute.mockResolvedValueOnce({ rows: [{ eligible: true }] })
   .mockResolvedValueOnce({ rows: [{ id: work.id, status: "pending", outcome_unconfirmed: status !== 429 }] });
  const send = vi.fn(async () => new Response(null, { status }));
  vi.stubGlobal("fetch", send);
  expect((await processEngagementCampaignDeliveries(10)).retry).toBe(1);
  expect(send).toHaveBeenCalledOnce();
  expect(mocked.transaction).toHaveBeenCalledOnce();
 });

 it("counts permanent provider rejection as a failed settlement", async () => {
  claim();
  mocked.execute.mockResolvedValueOnce({ rows: [{ eligible: true }] })
   .mockResolvedValueOnce({ rows: [{ id: work.id, status: "failed", outcome_unconfirmed: false }] });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 422 })));
  expect(await processEngagementCampaignDeliveries(1)).toEqual({
   accepted: 0, failed: 1, suppressed: 0, retry: 0, unconfirmed: 0,
  });
 });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSchoolWebsiteStarterContent } from "@/domain/site-local-content";

const mocks=vi.hoisted(()=>({
  readWelcome:vi.fn(),record:vi.fn(),throttle:vi.fn(),sendMail:vi.fn(),isDemo:vi.fn(),
}));
vi.mock("@tanstack/react-router",()=>({
  createFileRoute:()=>(config:unknown)=>({config}),
}));
vi.mock("@/lib/public-html-response.server",()=>({
  hasConfiguredPublicOrigin:()=>true,
  publicHtmlResponse:(body:string,options:{status?:number})=>
    new Response(body,{status:options.status??200,headers:{"Cache-Control":"private, no-store"}}),
}));
vi.mock("@/modules/enrollment/family-invitations.server",()=>({
  readPreopeningFamilyWelcome:mocks.readWelcome,
}));
vi.mock("@/modules/enrollment/public-admissions-interest.server",()=>({
  admitPublicAdmissionsInterest:mocks.throttle,recordInvitedFamilyInterest:mocks.record,
}));
vi.mock("@/modules/communication/notification-email.server",()=>({
  sendNotificationEmail:mocks.sendMail,
}));
vi.mock("@/modules/identity/demo-school-tenants.server",()=>({
  isDemoTenantOrganization:mocks.isDemo,
}));
import { Route } from "@/routes/family.interest";
type Handler=(args:{request:Request})=>Promise<Response>;
const handlers=(Route as unknown as {config:{server:{handlers:{GET:Handler;POST:Handler}}}})
  .config.server.handlers;
const batchId="11111111-1111-4111-8111-111111111111";
const recipientKey="22222222-2222-4222-8222-222222222222";
const origin="https://can-os.example.org";
const path=origin+"/family/interest?invitationBatchId="+batchId+"&invitationRecipientKey="+recipientKey;

function responseRequest(kind:"landing"|"survey",contactPreference="none",overrides:Record<string,string>={}){
  const data=new URLSearchParams({
    requestId:"33333333-3333-4333-8333-333333333333",
    invitationBatchId:batchId,invitationRecipientKey:recipientKey,
    firstName:"Jordan",lastName:"Adult",email:"jordan@example.org",
    message:"I'd like to learn more",website:"",
    contactConsent:"yes",responseKind:kind,
    ...(kind==="survey"?{
      grades:"middle",priority:"community",learningPace:"curious",
      contactPreference,comments:"A welcoming community",
    }:{}),...overrides,
  });
  return new Request(path,{
    method:"POST",headers:{Origin:origin,"Content-Type":"application/x-www-form-urlencoded"},
    body:data.toString(),
  });
}
beforeEach(()=>{
  vi.clearAllMocks();
  const content=createSchoolWebsiteStarterContent("Hillside School");
  mocks.readWelcome.mockResolvedValue({
    siteName:"Hillside School",organizationId:"33333333-3333-4333-8333-333333333333",
    programName:"Proposed high school",programStatus:"draft",
    introduction:"We are gathering feedback on a possible school.",
    invitedFamily:{firstName:"Jordan",lastName:"Adult",email:"jordan@example.org"},
    brand:{siteName:"Hillside School",branding:{
      ...content.branding,templateId:"community",paletteId:"brand-community",
    }},events:[],
  });
  mocks.throttle.mockResolvedValue({allowed:true,retryAfterSeconds:0});
  mocks.record.mockResolvedValue(undefined);
  mocks.sendMail.mockResolvedValue(true);
  mocks.isDemo.mockResolvedValue(false);
});
describe("branded family invitation route",()=>{
 it("shows chosen school design and survey for a scoped invitation",async()=>{
  const landing=await handlers.GET({request:new Request(path)});
  expect(landing.status).toBe(200);
  const body=await landing.text();
  expect(body).toContain('data-design="community"');
  expect(body).toContain("Hillside School");
  expect(body).toContain("We are gathering feedback");
  expect(body).toContain("three-minute family survey");
  expect(body).toContain('name="contactConsent"');
  expect(body).not.toContain("<script");
  expect(landing.headers.get("Content-Security-Policy")).toContain("form-action 'self'");
  const survey=await handlers.GET({request:new Request(path+"&view=survey")});
  const surveyBody=await survey.text();
  expect(surveyBody).toContain('name="grades"');
  expect(surveyBody).toContain('name="contactPreference"');
  expect(surveyBody).toContain('name="responseKind" value="survey"');
  expect(mocks.record).not.toHaveBeenCalled();
 });
 it("does not disclose a family identity without opaque invitation keys",async()=>{
  const result=await handlers.GET({request:new Request(origin+"/family/interest?invitationBatchId=bad")});
  expect(result.status).toBe(404);
  expect(mocks.readWelcome).not.toHaveBeenCalled();
 });
 it("accepts an adult survey with no follow-up and sends no email",async()=>{
  const result=await handlers.POST({request:responseRequest("survey","none")});
  expect(result.status).toBe(200);
  const sent=mocks.record.mock.calls[0]?.[0];
  expect(sent.responseKind).toBe("survey");
  expect(sent.contactPreference).toBe("none");
  expect(sent.message).toContain("Priority: community");
  expect(sent.message).toContain("Follow-up: none");
  expect(mocks.sendMail).not.toHaveBeenCalled();
 });
 it("sends branded confirmation after affirmative consent through the existing provider",async()=>{
  const result=await handlers.POST({request:responseRequest("landing")});
  expect(result.status).toBe(200);
  expect(mocks.record).toHaveBeenCalledTimes(1);
  expect(mocks.sendMail).toHaveBeenCalledTimes(1);
  const message=mocks.sendMail.mock.calls[0]?.[0];
  expect(message.subject).toContain("Hillside School");
  expect(message.html).toContain("#173c2e");
  expect(message.text).toContain("https://can-os.example.org/family/interest");
  expect(message.html).not.toContain("<script");
 });
 it("rejects manipulated survey choices or missing contact consent",async()=>{
  const invalid=await handlers.POST({request:responseRequest("survey","none",{priority:"<script>"})});
  expect(invalid.status).toBe(400);
  const missing=await handlers.POST({request:responseRequest("landing","email",{contactConsent:""})});
  expect(missing.status).toBe(400);
  expect(mocks.record).not.toHaveBeenCalled();
  expect(mocks.sendMail).not.toHaveBeenCalled();
 });
});

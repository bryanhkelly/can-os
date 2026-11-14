import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidAccessCredentialError } from "@/domain/access-errors";
type Handler = (input:{request:Request})=>Promise<Response>;
const state=vi.hoisted(()=>({handler:undefined as Handler|undefined,admit:vi.fn(),demo:vi.fn(),token:vi.fn()}));
vi.mock("@tanstack/react-router",()=>({createFileRoute:()=>(options:{server:{handlers:{POST:Handler}}})=>{
 state.handler=options.server.handlers.POST;return {};
}}));
vi.mock("@/modules/identity/anonymous-auth-admission.server",()=>({
 admitAnonymousAuthRequest:state.admit,anonymousAuthAdmissionResponse:()=>null,
}));
vi.mock("@/modules/identity/passwordless-access.server",()=>({redeemLocalDemoAccess:state.demo,redeemOneTimeAccess:state.token}));
vi.mock("@/modules/identity/authentication-rejections.server",()=>({recordRejectedAuthentication:vi.fn()}));
import "@/routes/access.verify";
const cookie="__Host-can_os_session=synthetic-session; Path=/; HttpOnly; Secure; SameSite=Lax";
beforeEach(()=>{vi.clearAllMocks();state.admit.mockResolvedValue({allowed:true});
 state.demo.mockResolvedValue({role:"registrar",setCookie:cookie});
 state.token.mockResolvedValue({role:"registrar",setCookie:cookie,launchSiteId:"site"});});
function form(data:Record<string,string>,origin="https://school.example"){
 return new Request("https://school.example/access/verify",{method:"POST",headers:{Origin:origin,
 "Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(data)});
}
describe("native session redemption",()=>{
 it("sets the protected cookie on a 303 navigation to a fixed workspace without credentials in the URL",async()=>{
  const response=await state.handler!({request:form({email:"admin@example.test",code:"fixture"})});
  expect(response.status).toBe(303);expect(response.headers.get("Location")).toBe("/admissions");
  expect(response.headers.getSetCookie()).toContain(cookie);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(state.demo).toHaveBeenCalledWith("admin@example.test","fixture",expect.objectContaining({deviceCategory:"desktop",ipAddress:null}));
 });
 it("arms one-shot return recovery only after successful sign-in to a saved page",async()=>{
  const response=await state.handler!({request:form({email:"admin@example.test",code:"fixture",returnTo:"/safeguarding"})});
  expect(response.headers.get("Location")).toBe("/safeguarding");
  expect(response.headers.getSetCookie()).toContain("can_os_access_return=1; Path=/; Max-Age=120; SameSite=Lax; Secure");
 });
 it("preserves the canonical onboarding destination for a one-time link",async()=>{
  const response=await state.handler!({request:form({token:"fixture-token"})});
  expect(state.token).toHaveBeenCalledWith("fixture-token",expect.objectContaining({deviceCategory:"desktop",ipAddress:null}));
  expect(response.headers.get("Location")).toBe("/launch/hub/school?siteId=site");
 });
 it("routes a new school Site Admin to that Site's Launch Studio",async()=>{
  state.demo.mockResolvedValue({role:"site_admin",setCookie:cookie,launchSiteId:"new-school-site"});
  const response=await state.handler!({request:form({email:"admin@school.demo",code:"fixture"})});
  expect(response.status).toBe(303);
  expect(response.headers.get("Location")).toBe("/launch/hub/school?siteId=new-school-site");
 });
 it("prefers Launch Studio over a generic dashboard return without arming return recovery",async()=>{
  state.demo.mockResolvedValue({role:"site_admin",setCookie:cookie,launchSiteId:"new-school-site"});
  const response=await state.handler!({request:form({email:"admin@school.demo",code:"fixture",returnTo:"/home"})});
  expect(response.headers.get("Location")).toBe("/launch/hub/school?siteId=new-school-site");
  expect(response.headers.getSetCookie()).toContain("can_os_access_return=; Path=/; Max-Age=0; SameSite=Lax; Secure");
 });
 it("keeps a specific saved page ahead of Launch Studio",async()=>{
  state.demo.mockResolvedValue({role:"site_admin",setCookie:cookie,launchSiteId:"new-school-site"});
  const response=await state.handler!({request:form({email:"admin@school.demo",code:"fixture",returnTo:"/operations/school-years"})});
  expect(response.headers.get("Location")).toBe("/operations/school-years");
  expect(response.headers.getSetCookie()).toContain("can_os_access_return=1; Path=/; Max-Age=120; SameSite=Lax; Secure");
 });
 it("routes the operating Valor Site Admin to the Valor school dashboard",async()=>{
  state.demo.mockResolvedValue({
   role:"site_admin",setCookie:cookie,homeSiteId:"f1000000-0000-4000-8000-000000000003",
  });
  const response=await state.handler!({request:form({email:"admin.demo@valorschool.demo",code:"000000"})});
  expect(response.status).toBe(303);
  expect(response.headers.get("Location"))
   .toBe("/sites/f1000000-0000-4000-8000-000000000003");
 });
 it("denies a cross-origin form before quota or credential work",async()=>{
  expect((await state.handler!({request:form({email:"admin@example.test",code:"fixture"},"https://other.example")})).status).toBe(403);
  expect(state.admit).not.toHaveBeenCalled();expect(state.demo).not.toHaveBeenCalled();
 });
 it("returns a generic form error without a session cookie after credential rejection",async()=>{
  state.demo.mockRejectedValue(new InvalidAccessCredentialError());
  const response=await state.handler!({request:form({email:"admin@example.test",code:"wrong"})});
  expect(response.headers.get("Location")).toBe("/access?error=invalid");
  expect(response.headers.has("Set-Cookie")).toBe(false);
 });
 it("retains the JSON API contract for existing clients",async()=>{
  const request=new Request("https://school.example/access/verify",{method:"POST",headers:{Origin:"https://school.example","Content-Type":"application/json"},body:JSON.stringify({email:"admin@example.test",code:"fixture"})});
  const response=await state.handler!({request});expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ok:true,role:"registrar"});
 });
});

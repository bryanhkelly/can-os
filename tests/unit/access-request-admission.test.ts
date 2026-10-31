import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (input:{request:Request})=>Promise<Response>;
const state=vi.hoisted(()=>({
 handler:undefined as Handler|undefined,
 admit:vi.fn(),
 requestLink:vi.fn(),
}));
vi.mock("@tanstack/react-router",()=>({
 createFileRoute:()=>(
  options:{server:{handlers:{POST:Handler}}},
 )=>{state.handler=options.server.handlers.POST;return {};},
}));
vi.mock("@/modules/identity/anonymous-auth-admission.server",()=>({
 admitAnonymousAuthRequest:state.admit,
 anonymousAuthAdmissionResponse:(r:{allowed:boolean;retryAfterSeconds:number})=>
  r.allowed?null:Response.json({error:"Too many authentication requests. Try again later."},
   {status:429,headers:{"Cache-Control":"no-store","Retry-After":String(r.retryAfterSeconds)}}),
}));
vi.mock("@/modules/identity/passwordless-access.server",()=>({
 requestOneTimeAccess:state.requestLink,
}));
import "@/routes/access.request";

function request(data:unknown,origin="http://localhost"){
 return new Request("http://localhost/access/request",{method:"POST",
  headers:{"Origin":origin,"Content-Type":"application/json"},body:JSON.stringify(data)});
}
beforeEach(()=>{
 state.admit.mockReset();
 state.admit.mockResolvedValue({allowed:true,retryAfterSeconds:0});
 state.requestLink.mockReset();
 state.requestLink.mockResolvedValue({accepted:true});
});
describe("email-link global admission at HTTP boundary",()=>{
 it("checks anonymous quota before parsing the email and calling the account service",async()=>{
  const response=await state.handler!({request:request({email:"user@example.test"})});
  expect(response.status).toBe(200);
  expect(state.admit).toHaveBeenCalledWith("request");
  expect(state.requestLink).toHaveBeenCalledWith("user@example.test");
 });
 it("rejects budget-exhausted requests before account lookup without revealing existence",async()=>{
  state.admit.mockResolvedValue({allowed:false,retryAfterSeconds:45});
  const response=await state.handler!({request:request({email:"private@example.test"})});
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("45");
  expect(state.requestLink).not.toHaveBeenCalled();
  expect(JSON.stringify(await response.json())).not.toContain("private@example.test");
 });
 it("fails closed on unavailable quota storage, not unthrottled email delivery",async()=>{
  state.admit.mockRejectedValue(new Error("private DB connection"));
  const response=await state.handler!({request:request({email:"private@example.test"})});
  expect(response.status).toBe(503);
  expect(state.requestLink).not.toHaveBeenCalled();
  expect(JSON.stringify(await response.json())).not.toContain("private DB");
 });
 it("preserves the anti-enumeration accepted result for unknown email",async()=>{
  state.requestLink.mockRejectedValue(new Error("unknown account"));
  const response=await state.handler!({request:request({email:"nonexistent@example.test"})});
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({accepted:true});
 });
 it("never checks credentials or consumes budget on cross-origin requests",async()=>{
  const response=await state.handler!({request:request({email:"user@example.test"},"https://attacker.example")});
  expect(response.status).toBe(403);
  expect(state.admit).not.toHaveBeenCalled();
  expect(state.requestLink).not.toHaveBeenCalled();
 });
});

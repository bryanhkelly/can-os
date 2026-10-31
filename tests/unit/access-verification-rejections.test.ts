import { beforeEach, describe, expect, it, vi } from "vitest";

type PostHandler=(input:{request:Request})=>Promise<Response>;
const state=vi.hoisted(()=>({
 post:undefined as PostHandler|undefined,
 redeem:vi.fn(),
 demo:vi.fn(),
 rejected:vi.fn(),
 admit:vi.fn(),
}));
vi.mock("@tanstack/react-router",()=>({
 createFileRoute:()=>(
  options:{server:{handlers:{POST:PostHandler}}},
 )=>{state.post=options.server.handlers.POST;return {};},
}));
vi.mock("@/modules/identity/passwordless-access.server",()=>({
 redeemOneTimeAccess:state.redeem,
 redeemLocalDemoAccess:state.demo,
}));
vi.mock("@/modules/identity/authentication-rejections.server",()=>({
 recordRejectedAuthentication:state.rejected,
}));
vi.mock("@/modules/identity/anonymous-auth-admission.server",()=>({
 admitAnonymousAuthRequest:state.admit,
 anonymousAuthAdmissionResponse:(result:{allowed:boolean;retryAfterSeconds:number})=>
  result.allowed?null:Response.json({error:"Too many authentication requests. Try again later."},
   {status:429,headers:{"Cache-Control":"no-store","Retry-After":String(result.retryAfterSeconds)}}),
}));
import "@/routes/access.verify";

const request=(data:unknown,origin="http://localhost")=>new Request(
 "http://localhost/access/verify",
 {method:"POST",headers:{"Origin":origin,"Content-Type":"application/json"},
  body:JSON.stringify(data)},
);

beforeEach(()=>{
 state.redeem.mockReset();
 state.demo.mockReset();
 state.rejected.mockReset();
 state.rejected.mockResolvedValue(true);
 state.admit.mockReset();
 state.admit.mockResolvedValue({allowed:true,retryAfterSeconds:0});
});

describe("unauthenticated verification failures",()=>{
 it("returns the same generic response and only a coarse method for wrong links",async()=>{
  state.redeem.mockRejectedValue(new Error("Sensitive DB issue for person@example.test"));
  const result=await state.post!({request:request({token:"very-secret-value"})});
  expect(result.status).toBe(401);
  expect(result.headers.get("Cache-Control")).toBe("no-store");
  const body=JSON.stringify(await result.json());
  expect(body).toContain("Invalid or expired access link");
  expect(body).not.toContain("Sensitive DB issue");
  expect(body).not.toContain("person@example.test");
  expect(body).not.toContain("very-secret-value");
  expect(state.rejected).toHaveBeenCalledWith("email_link");
 });
 it("does not store email/code on local-demo rejection",async()=>{
  state.demo.mockRejectedValue(new Error("Invalid local demo credentials"));
  const response=await state.post!({request:request({
   email:"private@example.test",code:"very-secret-code",
  })});
  expect(response.status).toBe(401);
  expect(state.rejected).toHaveBeenCalledWith("local_demo_code");
  expect(JSON.stringify(await response.json())).not.toContain("private@example.test");
 });
 it("does not affect authentication rejection if telemetry fails",async()=>{
  state.redeem.mockRejectedValue(new Error("Invalid or expired access link"));
  state.rejected.mockRejectedValue(new Error("DB telemetry offline"));
  const response=await state.post!({request:request({token:"invalid"})});
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({error:"Invalid or expired access link"});
 });
 it("does not audit successful logins as rejected attempts",async()=>{
  state.redeem.mockResolvedValue({
   setCookie:"__Host-can_os_session=dummy; HttpOnly; Secure",
   role:"student",accountId:"synthetic-account",
  });
  const response=await state.post!({request:request({token:"valid"})});
  expect(response.status).toBe(200);
  expect(state.rejected).not.toHaveBeenCalled();
 });
 it("denies over-budget submissions without evaluating the supplied credential",async()=>{
  state.admit.mockResolvedValue({allowed:false,retryAfterSeconds:12});
  const response=await state.post!({request:request({token:"redacted-secret"})});
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("12");
  expect(state.redeem).not.toHaveBeenCalled();
  expect(state.rejected).not.toHaveBeenCalled();
  expect(state.admit).toHaveBeenCalledWith("verify");
 });
 it("fails closed if the shared admission store cannot be reached",async()=>{
  state.admit.mockRejectedValue(new Error("private DB connection string"));
  const response=await state.post!({request:request({token:"redacted-secret"})});
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("connection string");
  expect(state.redeem).not.toHaveBeenCalled();
 });
 it("rejects cross-origin verification before checking credentials",async()=>{
  const response=await state.post!({request:request({token:"invalid"},"http://evil.example")});
  expect(response.status).toBe(403);
  expect(state.redeem).not.toHaveBeenCalled();
  expect(state.rejected).not.toHaveBeenCalled();
 });
});

import {describe,it,expect,vi,beforeEach} from "vitest";
import {AuthorizationError} from "@/domain/command-context";
const state=vi.hoisted(()=>({revoke:vi.fn()}));
vi.mock("@/modules/identity/passwordless-access.server",()=>({revokePresentedAccessSessions:state.revoke}));
import {handleAccessLogout} from "@/modules/identity/access-http.server";
const origin="https://can.example";
const cookies=["__Host-can_os_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0","__Host-can_os_v3_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"];
function request(method="POST",headerOrigin=origin){
 return new Request(origin+"/access/logout",{method,headers:{origin:headerOrigin}});
}
beforeEach(()=>{state.revoke.mockReset();state.revoke.mockResolvedValue(cookies);});
describe("ordinary logout transport",()=>{
 it("clears the two independent cookie names without merging headers",async()=>{
  const req=request(),response=await handleAccessLogout(req);
  expect(response.status).toBe(204);expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.getSetCookie()).toEqual(cookies);expect(state.revoke).toHaveBeenCalledWith(req);
 });
 it("rejects GET and untrusted origins before touching credentials",async()=>{
  expect((await handleAccessLogout(request("GET"))).status).toBe(405);
  expect((await handleAccessLogout(request("POST","https://other.example"))).status).toBe(403);
  expect(state.revoke).not.toHaveBeenCalled();
 });
 it("does not report logout or clear cookies when revocation fails",async()=>{
  state.revoke.mockRejectedValueOnce(new Error("database unavailable"));
  const unavailable=await handleAccessLogout(request());
  expect(unavailable.status).toBe(503);expect(unavailable.headers.getSetCookie()).toEqual([]);
  state.revoke.mockRejectedValueOnce(new AuthorizationError("unambiguous session cookie"));
  const ambiguous=await handleAccessLogout(request());
  expect(ambiguous.status).toBe(401);expect(ambiguous.headers.getSetCookie()).toEqual([]);
 });
});

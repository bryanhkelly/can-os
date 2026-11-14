import {describe,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({calls:0,queries:[] as string[]}));
vi.mock("@/db/client",()=>({db:{transaction:async(fn:(tx:unknown)=>Promise<unknown>)=>{
 state.calls++;
 return fn({execute:async(query:unknown)=>{
  state.queries.push(String(query));
  return {rows:state.queries.length===1?[{task_key:"security_metadata"}]:[]};
 }});
}}}));
import {runSessionDeviceRetention} from "@/workers/session-device-retention";
describe("security metadata retention",()=>{
 it("never runs without explicit opt-in",async()=>{
  vi.stubEnv("CAN_SESSION_DEVICE_RETENTION_ENABLED","");
  state.calls=0;
  expect(await runSessionDeviceRetention()).toBe(false);
  expect(state.calls).toBe(0);
  vi.unstubAllEnvs();
 });
});

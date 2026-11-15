import {afterEach,describe,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({calls:0,queries:0,lease:true}));
vi.mock("@/db/client",()=>({db:{transaction:async(fn:(tx:unknown)=>Promise<unknown>)=>{
 state.calls++;
 return fn({execute:async()=>({
  rows:++state.queries===1&&state.lease?[{task_key:"security_metadata"}]:[]
 })});
}}}));
import {runSessionDeviceRetention} from "@/workers/session-device-retention";
afterEach(()=>{vi.unstubAllEnvs();state.calls=0;state.queries=0;state.lease=true;});
describe("security metadata retention",()=>{
 it("never runs without opt-in",async()=>{
  vi.stubEnv("CAN_SESSION_DEVICE_RETENTION_ENABLED","");
  expect(await runSessionDeviceRetention()).toBe(false);
  expect(state.calls).toBe(0);
 });
 it("performs three retention statements after acquiring daily lease",async()=>{
  vi.stubEnv("CAN_SESSION_DEVICE_RETENTION_ENABLED","1");
  expect(await runSessionDeviceRetention()).toBe(true);
  expect(state.queries).toBe(4);
 });
 it("does no cleanup if lease not acquired",async()=>{
  vi.stubEnv("CAN_SESSION_DEVICE_RETENTION_ENABLED","1");
  state.lease=false;
  expect(await runSessionDeviceRetention()).toBe(false);
  expect(state.queries).toBe(1);
 });
 it("permits the Cloudflare cron's trusted enabled flag",async()=>{
  vi.stubEnv("CAN_SESSION_DEVICE_RETENTION_ENABLED","0");
  expect(await runSessionDeviceRetention(true)).toBe(true);
  expect(state.queries).toBe(4);
 });
});

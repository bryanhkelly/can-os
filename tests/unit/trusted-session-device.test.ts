import {afterEach,describe,expect,it,vi} from "vitest";
const fake=vi.hoisted(()=>({ip:"203.0.113.7",fail:false}));
vi.mock("@netlify/functions",()=>({getContext:()=>{
 if(fake.fail)throw new Error("Missing runtime context");
 return {ip:fake.ip};
}}));
import {readTrustedSessionDevice} from "@/modules/identity/trusted-session-device.server";
afterEach(()=>{vi.unstubAllEnvs();fake.fail=false;fake.ip="203.0.113.7";});
describe("trusted runtime client IP",()=>{
 const req=()=>new Request("https://can.example/access/verify",{headers:{
  "x-forwarded-for":"198.51.100.10","x-nf-client-connection-ip":"192.0.2.55"
 }});
 it("does not collect when disabled",async()=>{
  vi.stubEnv("CAN_SESSION_IP_COLLECTION_ENABLED","0");
  expect((await readTrustedSessionDevice(req())).ipAddress).toBeNull();
 });
 it("uses verified server context rather than spoofed headers",async()=>{
  vi.stubEnv("CAN_SESSION_IP_COLLECTION_ENABLED","1");
  const x=await readTrustedSessionDevice(req());
  expect(x.ipAddress).toBe("203.0.113.7");
  expect(x.networkObservedAt).toBeInstanceOf(Date);
 });
 it("fails closed if runtime context is unavailable",async()=>{
  vi.stubEnv("CAN_SESSION_IP_COLLECTION_ENABLED","1");fake.fail=true;
  expect((await readTrustedSessionDevice(req())).ipAddress).toBeNull();
 });
 it("rejects non-IP runtime context",async()=>{
  vi.stubEnv("CAN_SESSION_IP_COLLECTION_ENABLED","1");fake.ip="bad";
  expect((await readTrustedSessionDevice(req())).ipAddress).toBeNull();
 });
});

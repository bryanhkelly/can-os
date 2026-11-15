import {afterEach,describe,expect,it,vi} from "vitest";
const fake=vi.hoisted(()=>({ip:"203.0.113.7",fail:false}));
vi.mock("@netlify/functions",()=>({getContext:()=>{
 if(fake.fail)throw new Error("Missing runtime context");
 return {ip:fake.ip};
}}));
import {readTrustedSessionDevice,withTrustedCloudflareIngress} from "@/modules/identity/trusted-session-device.server";
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
 it("uses scoped Cloudflare ingress IP rather than supplied forwarded headers",async()=>{
  vi.stubEnv("CAN_SESSION_IP_COLLECTION_ENABLED","1");
  const value=await withTrustedCloudflareIngress("198.51.100.9",()=>readTrustedSessionDevice(req()));
  expect(value.ipAddress).toBe("198.51.100.9");
 });
 it("fails closed if scoped Cloudflare ingress has no verified IP",async()=>{
  vi.stubEnv("CAN_SESSION_IP_COLLECTION_ENABLED","1");
  const value=await withTrustedCloudflareIngress(null,()=>readTrustedSessionDevice(req()));
  expect(value.ipAddress).toBeNull();
 });
 it("isolates overlapping requests",async()=>{
  vi.stubEnv("CAN_SESSION_IP_COLLECTION_ENABLED","1");
  const values=await Promise.all([
   withTrustedCloudflareIngress("198.51.100.1",()=>readTrustedSessionDevice(req())),
   withTrustedCloudflareIngress("198.51.100.2",()=>readTrustedSessionDevice(req())),
  ]);
  expect(values.map(value=>value.ipAddress)).toEqual(["198.51.100.1","198.51.100.2"]);
 });
});

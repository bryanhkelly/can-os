import { afterEach, describe, expect, it } from "vitest";
import { assertSyntheticMutation, isSyntheticAccessEnabled } from "@/modules/_demo/demo-write-gate";
describe("synthetic mutation authorization boundary",()=>{
 const originalMode=process.env.NODE_ENV;
 const originalFlag=process.env.CAN_DEMO_WRITES_ENABLED;
 afterEach(()=>{process.env.NODE_ENV=originalMode; if(originalFlag===undefined)delete process.env.CAN_DEMO_WRITES_ENABLED; else process.env.CAN_DEMO_WRITES_ENABLED=originalFlag;});
 it("fails closed unless explicitly enabled",()=>{delete process.env.CAN_DEMO_WRITES_ENABLED;expect(()=>assertSyntheticMutation("teacher")).toThrow("disabled");process.env.CAN_DEMO_WRITES_ENABLED="true";expect(()=>assertSyntheticMutation("teacher")).not.toThrow();process.env.CAN_DEMO_WRITES_ENABLED="false";expect(()=>assertSyntheticMutation("teacher")).toThrow("disabled");});
 it("requires the explicit opt-in even in production",()=>{process.env.NODE_ENV="production";delete process.env.CAN_DEMO_WRITES_ENABLED;expect(()=>assertSyntheticMutation("registrar")).toThrow("disabled");process.env.CAN_DEMO_WRITES_ENABLED="true";expect(()=>assertSyntheticMutation("registrar")).not.toThrow();});
 it("reports collaboration availability independently of NODE_ENV",()=>{process.env.NODE_ENV="production";delete process.env.CAN_DEMO_WRITES_ENABLED;expect(isSyntheticAccessEnabled()).toBe(false);process.env.CAN_DEMO_WRITES_ENABLED="true";expect(isSyntheticAccessEnabled()).toBe(true);});
 it("accepts only declared demo roles",()=>{process.env.NODE_ENV="production";process.env.CAN_DEMO_WRITES_ENABLED="true";expect(()=>assertSyntheticMutation("student")).not.toThrow();expect(()=>assertSyntheticMutation("administrator" as never)).toThrow("Unknown");});
});

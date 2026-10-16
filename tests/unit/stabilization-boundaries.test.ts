import { afterEach, describe, expect, it } from "vitest";
import { assertSyntheticMutation, isSyntheticAccessEnabled } from "@/modules/student-experience/demo-write-gate";
describe("synthetic mutation authorization boundary",()=>{
 const originalMode=process.env.NODE_ENV;
 const originalFlag=process.env.CAN_DEMO_WRITES_ENABLED;
 afterEach(()=>{process.env.NODE_ENV=originalMode; if(originalFlag===undefined)delete process.env.CAN_DEMO_WRITES_ENABLED; else process.env.CAN_DEMO_WRITES_ENABLED=originalFlag;});
 it("keeps first-development workflows enabled unless explicitly turned off",()=>{delete process.env.CAN_DEMO_WRITES_ENABLED;expect(()=>assertSyntheticMutation("teacher")).not.toThrow();process.env.CAN_DEMO_WRITES_ENABLED="false";expect(()=>assertSyntheticMutation("teacher")).toThrow("disabled");});
 it("keeps production available for this first development deployment",()=>{process.env.NODE_ENV="production";process.env.CAN_DEMO_WRITES_ENABLED="true";expect(()=>assertSyntheticMutation("registrar")).not.toThrow();process.env.CAN_DEMO_WRITES_ENABLED="false";expect(()=>assertSyntheticMutation("registrar")).toThrow("disabled");});
 it("reports collaboration availability independently of NODE_ENV",()=>{process.env.NODE_ENV="production";delete process.env.CAN_DEMO_WRITES_ENABLED;expect(isSyntheticAccessEnabled()).toBe(true);process.env.CAN_DEMO_WRITES_ENABLED="false";expect(isSyntheticAccessEnabled()).toBe(false);});
 it("accepts only declared demo roles",()=>{process.env.NODE_ENV="production";delete process.env.CAN_DEMO_WRITES_ENABLED;expect(()=>assertSyntheticMutation("student")).not.toThrow();expect(()=>assertSyntheticMutation("administrator" as never)).toThrow("Unknown");});
});

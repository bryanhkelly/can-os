import { afterEach, describe, expect, it } from "vitest";
import { assertSyntheticMutation, isSyntheticAccessEnabled } from "@/modules/student-experience/demo-write-gate";
describe("synthetic mutation authorization boundary",()=>{
 const originalMode=process.env.NODE_ENV;
 const originalFlag=process.env.CAN_DEMO_WRITES_ENABLED;
 afterEach(()=>{process.env.NODE_ENV=originalMode; if(originalFlag===undefined)delete process.env.CAN_DEMO_WRITES_ENABLED; else process.env.CAN_DEMO_WRITES_ENABLED=originalFlag;});
 it("fails closed when no dev write gate is set",()=>{delete process.env.CAN_DEMO_WRITES_ENABLED;expect(()=>assertSyntheticMutation("teacher")).toThrow("disabled");});
 it("refuses production writes even with an override",()=>{process.env.NODE_ENV="production";process.env.CAN_DEMO_WRITES_ENABLED="true";expect(()=>assertSyntheticMutation("registrar")).toThrow("disabled");});
 it("reports read availability without treating disabled collaboration as an empty group list",()=>{process.env.NODE_ENV="production";process.env.CAN_DEMO_WRITES_ENABLED="true";expect(isSyntheticAccessEnabled()).toBe(false);process.env.NODE_ENV="test";expect(isSyntheticAccessEnabled()).toBe(true);delete process.env.CAN_DEMO_WRITES_ENABLED;expect(isSyntheticAccessEnabled()).toBe(false);});
 it("accepts declared demo role only on explicit development instances",()=>{process.env.NODE_ENV="test";process.env.CAN_DEMO_WRITES_ENABLED="true";expect(()=>assertSyntheticMutation("student")).not.toThrow();expect(()=>assertSyntheticMutation("administrator" as never)).toThrow("Unknown");});
});

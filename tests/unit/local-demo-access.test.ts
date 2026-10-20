import {describe,it,expect} from "vitest";
import {isLocalDemoAccessEnabled,LOCAL_DEMO_ACCESS_CODE,LOCAL_DEMO_ACCOUNTS} from "@/domain/local-demo-access";

describe("local synthetic demo access",()=>{
 it("allows the fixed code only with explicit opt-in in development or test",()=>{
  expect(isLocalDemoAccessEnabled({NODE_ENV:"development",CAN_DEMO_FIXED_ACCESS_ENABLED:"true"})).toBe(true);
  expect(isLocalDemoAccessEnabled({NODE_ENV:"test",CAN_DEMO_FIXED_ACCESS_ENABLED:"true"})).toBe(true);
  expect(isLocalDemoAccessEnabled({NODE_ENV:"production",CAN_DEMO_FIXED_ACCESS_ENABLED:"true"})).toBe(false);
  expect(isLocalDemoAccessEnabled({NODE_ENV:"development"})).toBe(false);
  expect(isLocalDemoAccessEnabled({NODE_ENV:"test",CAN_DEMO_FIXED_ACCESS_ENABLED:"false"})).toBe(false);
 });

 it("only lists the seeded synthetic demo accounts",()=>{
  expect(LOCAL_DEMO_ACCESS_CODE).toBe("CANOS-LOCAL-TEST");
  expect(LOCAL_DEMO_ACCOUNTS.map(account=>account.email)).toEqual([
   "jordan.student@can-os.invalid",
   "riley.teacher@can-os.invalid",
   "casey.specialist@can-os.invalid",
   "morgan.guardian@can-os.invalid",
   "alex.registrar@can-os.invalid",
   "admin.demo@can-os.invalid",
  ]);
 });
});

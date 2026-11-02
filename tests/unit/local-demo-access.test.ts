import {describe,it,expect} from "vitest";
import {
 isDemoAccountEmail,isLocalDemoProvisioningEnabled,
 LOCAL_DEMO_ACCESS_CODE,LOCAL_DEMO_ACCOUNTS,
} from "@/domain/local-demo-access";

describe("tenant demo provisioning and identities",()=>{
 it("keeps provisioning explicitly enabled and restricted to development or test",()=>{
  expect(isLocalDemoProvisioningEnabled({NODE_ENV:"development",CAN_DEMO_FIXED_ACCESS_ENABLED:"true"})).toBe(true);
  expect(isLocalDemoProvisioningEnabled({NODE_ENV:"test",CAN_DEMO_FIXED_ACCESS_ENABLED:"true"})).toBe(true);
  expect(isLocalDemoProvisioningEnabled({NODE_ENV:"development"})).toBe(false);
  expect(isLocalDemoProvisioningEnabled({NODE_ENV:"test",CAN_DEMO_FIXED_ACCESS_ENABLED:"false"})).toBe(false);
  expect(isLocalDemoProvisioningEnabled({NODE_ENV:"production",CAN_DEMO_FIXED_ACCESS_ENABLED:"true"})).toBe(false);
 });

 it("uses the tenant demo domain, fixed code and exact approved identities",()=>{
  expect(LOCAL_DEMO_ACCESS_CODE).toBe("000000");
  expect(isDemoAccountEmail("ALEX.REGISTRAR@VALORSCHOOL.DEMO")).toBe(true);
  expect(isDemoAccountEmail("person@example.org")).toBe(false);
  expect(LOCAL_DEMO_ACCOUNTS.map(account=>account.email)).toEqual([
   "jordan.student@valorschool.demo",
   "riley.teacher@valorschool.demo",
   "casey.specialist@valorschool.demo",
   "morgan.guardian@valorschool.demo",
   "alex.registrar@valorschool.demo",
   "admin.demo@valorschool.demo",
  ]);
 });
});

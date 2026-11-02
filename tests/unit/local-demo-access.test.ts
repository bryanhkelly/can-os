import {describe,it,expect} from "vitest";
import {
 isDemoAccountEmail,isDemoSchoolGrant,isLocalDemoProvisioningEnabled,
 LOCAL_DEMO_ACCESS_CODE,LOCAL_DEMO_ACCOUNTS,LOCAL_DEMO_ADMIN,
} from "@/domain/local-demo-access";

describe("synthetic demo access",()=>{
 it("keeps local demo provisioning behind its explicit flag",()=>{
  expect(isLocalDemoProvisioningEnabled({NODE_ENV:"development",CAN_DEMO_FIXED_ACCESS_ENABLED:"true"})).toBe(true);
  expect(isLocalDemoProvisioningEnabled({NODE_ENV:"test",CAN_DEMO_FIXED_ACCESS_ENABLED:"true"})).toBe(true);
  expect(isLocalDemoProvisioningEnabled({NODE_ENV:"development",CAN_DEMO_FIXED_ACCESS_ENABLED:"false"})).toBe(false);
  expect(isLocalDemoProvisioningEnabled({NODE_ENV:"test"})).toBe(false);
  expect(isLocalDemoProvisioningEnabled({NODE_ENV:"production",CAN_DEMO_FIXED_ACCESS_ENABLED:"true"})).toBe(false);
 });

 it("only lists the seeded synthetic demo accounts",()=>{
  expect(LOCAL_DEMO_ACCESS_CODE).toBe("000000");
  expect(LOCAL_DEMO_ACCOUNTS.map(account=>account.email)).toEqual([
   "jordan.student@valorschool.demo",
   "riley.teacher@valorschool.demo",
   "casey.specialist@valorschool.demo",
   "morgan.guardian@valorschool.demo",
   "alex.registrar@valorschool.demo",
   "admin.demo@valorschool.demo",
  ]);
 });

 it("derives eligibility from the demo school grant",()=>{
  expect(isDemoAccountEmail("teacher@valorschool.demo")).toBe(true);
  expect(isDemoAccountEmail("teacher@example.com")).toBe(false);
  expect(isDemoSchoolGrant({
   organizationId:LOCAL_DEMO_ADMIN.organizationId,
   siteId:LOCAL_DEMO_ADMIN.siteId,
  })).toBe(true);
  expect(isDemoSchoolGrant({
   organizationId:LOCAL_DEMO_ADMIN.organizationId,
   siteId:"f1000000-0000-4000-8000-000000000999",
  })).toBe(false);
 });
});

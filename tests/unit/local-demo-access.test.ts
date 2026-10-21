import {describe,it,expect} from "vitest";
import {
 isDemoAccountEmail,isDemoSchoolGrant,isLocalDemoAccessEnabled,isPublicDemoAccessEnabled,
 LOCAL_DEMO_ACCESS_CODE,LOCAL_DEMO_ACCOUNTS,LOCAL_DEMO_ADMIN,
} from "@/domain/local-demo-access";

describe("synthetic demo access",()=>{
 it("allows the fixed code only with explicit opt-in in development or test",()=>{
  expect(isLocalDemoAccessEnabled({NODE_ENV:"development",CAN_DEMO_FIXED_ACCESS_ENABLED:"true"})).toBe(true);
  expect(isLocalDemoAccessEnabled({NODE_ENV:"test",CAN_DEMO_FIXED_ACCESS_ENABLED:"true"})).toBe(true);
  expect(isLocalDemoAccessEnabled({NODE_ENV:"production",CAN_DEMO_FIXED_ACCESS_ENABLED:"true"})).toBe(false);
  expect(isLocalDemoAccessEnabled({NODE_ENV:"development"})).toBe(false);
  expect(isLocalDemoAccessEnabled({NODE_ENV:"test",CAN_DEMO_FIXED_ACCESS_ENABLED:"false"})).toBe(false);
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

 it("requires explicit public enablement and derives eligibility from the demo school grant",()=>{
  expect(isPublicDemoAccessEnabled({CAN_DEMO_PUBLIC_ACCESS_ENABLED:"true"})).toBe(true);
  expect(isPublicDemoAccessEnabled({CAN_DEMO_PUBLIC_ACCESS_ENABLED:"false"})).toBe(false);
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

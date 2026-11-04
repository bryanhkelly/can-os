import {describe,it,expect} from "vitest";
import {
 isDemoAccountEmail,isLocalDemoProvisioningEnabled,isApprovedDemoGrant,
 LOCAL_DEMO_ACCESS_CODE,LOCAL_DEMO_ACCOUNTS,LOCAL_DEMO_ADMIN,LOCAL_DEMO_ROOM_FACILITATOR,
} from "@/domain/local-demo-access";

describe("tenant demo provisioning and identities",()=>{
 it("keeps provisioning explicitly enabled and restricted to development or test",()=>{
  expect(isLocalDemoProvisioningEnabled({NODE_ENV:"development",CAN_DEMO_FIXED_ACCESS_ENABLED:"true"})).toBe(true);
  expect(isLocalDemoProvisioningEnabled({NODE_ENV:"test",CAN_DEMO_FIXED_ACCESS_ENABLED:"true"})).toBe(true);
  expect(isLocalDemoProvisioningEnabled({NODE_ENV:"development"})).toBe(false);
  expect(isLocalDemoProvisioningEnabled({NODE_ENV:"test",CAN_DEMO_FIXED_ACCESS_ENABLED:"false"})).toBe(false);
  expect(isLocalDemoProvisioningEnabled({NODE_ENV:"production",CAN_DEMO_FIXED_ACCESS_ENABLED:"true"})).toBe(false);
 });
 it("binds the fixed administrator to its canonical Site Admin identity and scope",()=>{
  const grant={...LOCAL_DEMO_ADMIN,role:"site_admin"};
  expect(isApprovedDemoGrant(grant,LOCAL_DEMO_ADMIN.email)).toBe(true);
  for(const changed of [
   {role:"registrar"},{accountId:"foreign"},{personId:"foreign"},
   {organizationId:"foreign"},{siteId:"foreign"},
  ]) expect(isApprovedDemoGrant({...grant,...changed},LOCAL_DEMO_ADMIN.email)).toBe(false);
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
   "sally.facilitator@valorschool.demo",
  ]);
 });
 it("binds Sally only to the approved Valor room facilitator identity",()=>{
  const grant={...LOCAL_DEMO_ROOM_FACILITATOR,role:"room_facilitator"};
  expect(isApprovedDemoGrant(grant,LOCAL_DEMO_ROOM_FACILITATOR.email)).toBe(true);
  for(const changed of [{role:"teacher"},{role:"site_admin"},{personId:"other"},
   {accountId:"other"},{siteId:"other"},{organizationId:"other"}])
   expect(isApprovedDemoGrant({...grant,...changed},LOCAL_DEMO_ROOM_FACILITATOR.email)).toBe(false);
  expect(isApprovedDemoGrant(grant,"sally@valorschool.demo")).toBe(false);
 });
});

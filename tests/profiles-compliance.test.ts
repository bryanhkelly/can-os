import { describe, it, expect } from "vitest";
import { credentialState, evaluatePersonRequirements, validateSchoolConfiguration } from "../src/domain/profiles-compliance";
const date = new Date("2026-10-15T12:00:00Z");
describe("person qualification readiness", () => {
 it("requires verified unexpired CPR and identifies missing first aid", () => {
   const result = evaluatePersonRequirements([{code:"SAFETY",requiredCredentialTypes:["cpr","first_aid"],mandatory:true}], [
     {credentialType:"cpr", verificationStatus:"verified", expiresAt:new Date("2027-01-01")}
   ],date);
   expect(result).toEqual([{code:"SAFETY",status:"missing",blocking:true}]);
 });
 it("never equates claimed credentials with verified qualifications", () => {
   expect(credentialState({credentialType:"cpr",verificationStatus:"pending"},date)).toBe("pending");
   expect(credentialState({credentialType:"cpr",verificationStatus:"verified",expiresAt:new Date("2026-01-01")},date)).toBe("expired");
 });
 it("accepts a newer verified credential when a previous one expired", () => {
   expect(evaluatePersonRequirements([{code:"CPR",requiredCredentialTypes:["cpr"],mandatory:true}], [
      {credentialType:"cpr",verificationStatus:"verified",expiresAt:new Date("2025-01-01")},
      {credentialType:"cpr",verificationStatus:"verified",expiresAt:new Date("2027-01-01")}
   ],date)[0].status).toBe("met");
 });
});
describe("school-in-a-box configuration", () => {
 const base = {deploymentModel:"school_extension" as const, grades:{min:"9",max:"12"},delivery:{onsite:true,asynchronous:true,liveOnline:true,onsiteDaysPerWeek:2}, responsibilities:{instruction:"can" as const,supervision:"host" as const,attendance:"host" as const,safeguarding:"host" as const,records:"can" as const},services:["courses","attendance"]};
 it("supports a hybrid K-8 high school extension",()=> expect(validateSchoolConfiguration(base)).toEqual([]));
 it("rejects unowned safety responsibilities and unsupported schedules",()=> {
    const config={...base, delivery:{...base.delivery, onsiteDaysPerWeek:8},responsibilities:{...base.responsibilities,safeguarding:undefined as never}};
    expect(validateSchoolConfiguration(config)).toEqual(expect.arrayContaining(["Responsibility owner required: safeguarding","Onsite days must be a whole number from zero to seven, with onsite enabled"]));
 });
});

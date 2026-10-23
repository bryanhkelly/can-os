import {describe,expect,it} from "vitest";
import {verifiedEnrollmentStudentIds,isVerifiedEnrollmentGuardian} from "@/domain/guardian-offer-visibility";

describe("guardian offer visibility",()=>{
  it("keeps checklist and offer permissions in sync",()=>{
    expect(isVerifiedEnrollmentGuardian({canManageEnrollment:true,metadata:{verification:"verified"}})).toBe(true);
    expect(isVerifiedEnrollmentGuardian({canManageEnrollment:true,metadata:{verification:"pending"}})).toBe(false);
    expect(isVerifiedEnrollmentGuardian({canManageEnrollment:false,metadata:{verification:"verified"}})).toBe(false);
    expect(isVerifiedEnrollmentGuardian(undefined)).toBe(false);
  });
  it("only exposes children with independently verified, active enrollment permission",()=>{
    const actual=verifiedEnrollmentStudentIds([
      {studentPersonId:"verified-child",canManageEnrollment:true,metadata:{verification:"verified"}},
      {studentPersonId:"verified-child",canManageEnrollment:true,metadata:{verification:"verified"}},
      {studentPersonId:"unverified-child",canManageEnrollment:true,metadata:{}},
      {studentPersonId:"pending-child",canManageEnrollment:true,metadata:{verification:"pending"}},
      {studentPersonId:"revoked-child",canManageEnrollment:false,metadata:{verification:"verified"}},
      {studentPersonId:"unrelated-child",canManageEnrollment:false,metadata:{}},
    ]);
    expect(actual).toEqual(["verified-child"]);
  });
});

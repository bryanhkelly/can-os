import {describe,expect,it} from "vitest";
import {verifiedEnrollmentStudentIds} from "@/domain/guardian-offer-visibility";

describe("guardian offer visibility",()=>{
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

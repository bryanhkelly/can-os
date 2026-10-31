import {describe,it,expect} from "vitest";
import {canAuthorizeAcademicCredentialRelease,canDownloadAuthorizedCredential,canRedeemTransferCredential,EXTERNAL_SCHOOL_TO_SCHOOL_RELEASE_SUPPORTED} from "@/domain/academic-credential-release";
const now=new Date("2026-10-31T12:00:00Z");
const valid={actorPersonId:"recipient-1",recipientPersonId:"recipient-1",recipientEmail:"person@example.org",accountEmail:"PERSON@example.org",recipientActive:true,expiresAt:new Date("2026-11-01T12:00:00Z"),revokedAt:null,now,demoFacilitator:false};
describe("official academic credential release gate",()=>{
 it("permits only exact authenticated recipient with active authorization",()=>{
  expect(canDownloadAuthorizedCredential(valid)).toBe(true);
 });
 it.each([
  {actorPersonId:null},{actorPersonId:"another-person"},
  {accountEmail:"another@example.org"},{accountEmail:null},
  {recipientActive:false},{demoFacilitator:true},
  {expiresAt:now},{expiresAt:new Date("2026-10-30T12:00:00Z")},
  {revokedAt:new Date("2026-10-31T11:00:00Z")},
 ])("rejects invalid identity or authorization: %j",override=>{
  expect(canDownloadAuthorizedCredential({...valid,...override})).toBe(false);
 });
});

describe("independent credential release review",()=>{
 const valid={issuerMatches:true,studentMatches:true,verifiedRecipient:true,
  trustedInstructions:true,validAuthorityEvidence:true,registrarApproved:true,
  demoActor:false,purpose:"transfer" as const,
  expiresAt:new Date("2026-11-01T12:00:00Z"),now};
 it("requires every independent verification and registrar approval",()=>{
  expect(canAuthorizeAcademicCredentialRelease(valid)).toBe(true);
  for(const field of ["issuerMatches","studentMatches","verifiedRecipient","trustedInstructions","validAuthorityEvidence","registrarApproved"] as const){
   expect(canAuthorizeAcademicCredentialRelease({...valid,[field]:false})).toBe(false);
  }
 });
 it("rejects demo users, expired/overlong grants and unsupported purposes",()=>{
  expect(canAuthorizeAcademicCredentialRelease({...valid,demoActor:true})).toBe(false);
  expect(canAuthorizeAcademicCredentialRelease({...valid,expiresAt:now})).toBe(false);
  expect(canAuthorizeAcademicCredentialRelease({...valid,expiresAt:new Date("2027-01-01T12:00:00Z")})).toBe(false);
  expect(canAuthorizeAcademicCredentialRelease({...valid,purpose:"freeform" as never})).toBe(false);
 });
});

describe("live guardian transfer authority",()=>{
 const valid={consentActive:true,consentMatchesStudent:true,
  consentMatchesGuardian:true,consentMatchesAction:true,
  consentMatchesDestination:true,consentMatchesProgram:true,
  relationshipActive:true,actionResolved:true,actionMatchesStudent:true,
  actionMatchesGuardian:true,actionMatchesConsent:true,
  actionCompleted:true,issuerMatches:true};
 it("requires the entire original consent and transfer to remain valid",()=>{
  expect(canRedeemTransferCredential(valid)).toBe(true);
  for(const field of Object.keys(valid) as Array<keyof typeof valid>){
   expect(canRedeemTransferCredential({...valid,[field]:false})).toBe(false);
  }
 });
 it("does not claim external school-to-school delivery",()=>{
  expect(EXTERNAL_SCHOOL_TO_SCHOOL_RELEASE_SUPPORTED).toBe(false);
 });
});

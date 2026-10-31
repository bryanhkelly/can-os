import { describe,expect,it } from "vitest";
import { canAuthorizeAcademicCredentialRelease,canDownloadAuthorizedCredential } from "./academic-credential-release";

const now=new Date("2026-10-31T12:00:00.000Z");
const good={
 issuerMatches:true,studentMatches:true,verifiedRecipient:true,
 trustedInstructions:true,validAuthorityEvidence:true,registrarApproved:true,
 demoActor:false,purpose:"postsecondary_admission" as const,
 expiresAt:new Date("2026-11-01T12:00:00.000Z"),now
};
describe("academic credential release policy",()=>{
 it("accepts fully independently verified release",()=>expect(canAuthorizeAcademicCredentialRelease(good)).toBe(true));
 it.each(["issuerMatches","studentMatches","verifiedRecipient","trustedInstructions","validAuthorityEvidence","registrarApproved"] as const)("rejects missing %s",key=>expect(canAuthorizeAcademicCredentialRelease({...good,[key]:false})).toBe(false));
 it("rejects a demo actor",()=>expect(canAuthorizeAcademicCredentialRelease({...good,demoActor:true})).toBe(false));
 it("rejects expired, overlong and unsupported purposes",()=>{
  expect(canAuthorizeAcademicCredentialRelease({...good,expiresAt:now})).toBe(false);
  expect(canAuthorizeAcademicCredentialRelease({...good,expiresAt:new Date("2026-12-31T12:00:00.000Z")})).toBe(false);
  expect(canAuthorizeAcademicCredentialRelease({...good,purpose:"other" as never})).toBe(false);
 });
 it("rejects changed recipient, expired and revoked downloads",()=>{
  const recipient={actorPersonId:"person-1",recipientPersonId:"person-1",recipientEmail:"verified@example.org",accountEmail:"verified@example.org",recipientActive:true,expiresAt:good.expiresAt,revokedAt:null,now,demoFacilitator:false};
  expect(canDownloadAuthorizedCredential(recipient)).toBe(true);
  expect(canDownloadAuthorizedCredential({...recipient,actorPersonId:"person-2"})).toBe(false);
  expect(canDownloadAuthorizedCredential({...recipient,accountEmail:"other@example.org"})).toBe(false);
  expect(canDownloadAuthorizedCredential({...recipient,expiresAt:now})).toBe(false);
  expect(canDownloadAuthorizedCredential({...recipient,revokedAt:now})).toBe(false);
 });
});

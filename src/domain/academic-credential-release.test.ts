import { describe,expect,it } from "vitest";
import { canAuthorizeAcademicCredentialRelease,canDownloadAuthorizedCredential,canRedeemTransferCredential,isLatestTranscriptIssuance,canReauthorizeCredentialRelease } from "./academic-credential-release";

const now=new Date("2026-10-31T12:00:00.000Z");
const good={
 issuerMatches:true,studentMatches:true,verifiedRecipient:true,
 trustedInstructions:true,validAuthorityEvidence:true,registrarApproved:true,
 delegatedSession:false,purpose:"postsecondary_admission" as const,
 expiresAt:new Date("2026-11-01T12:00:00.000Z"),now
};
describe("academic credential release policy",()=>{
 it("accepts fully independently verified release",()=>expect(canAuthorizeAcademicCredentialRelease(good)).toBe(true));
 it.each(["issuerMatches","studentMatches","verifiedRecipient","trustedInstructions","validAuthorityEvidence","registrarApproved"] as const)("rejects missing %s",key=>expect(canAuthorizeAcademicCredentialRelease({...good,[key]:false})).toBe(false));
 it("rejects a delegated session",()=>expect(canAuthorizeAcademicCredentialRelease({...good,delegatedSession:true})).toBe(false));
 it("rejects expired, overlong and unsupported purposes",()=>{
  expect(canAuthorizeAcademicCredentialRelease({...good,expiresAt:now})).toBe(false);
  expect(canAuthorizeAcademicCredentialRelease({...good,expiresAt:new Date("2026-12-31T12:00:00.000Z")})).toBe(false);
  expect(canAuthorizeAcademicCredentialRelease({...good,purpose:"other" as never})).toBe(false);
 });
 it("rejects changed recipient, expired and revoked downloads",()=>{
  const recipient={actorPersonId:"person-1",recipientPersonId:"person-1",recipientEmail:"verified@example.org",accountEmail:"verified@example.org",recipientActive:true,expiresAt:good.expiresAt,revokedAt:null,now,delegatedSession:false};
  expect(canDownloadAuthorizedCredential(recipient)).toBe(true);
  expect(canDownloadAuthorizedCredential({...recipient,actorPersonId:"person-2"})).toBe(false);
  expect(canDownloadAuthorizedCredential({...recipient,accountEmail:"other@example.org"})).toBe(false);
  expect(canDownloadAuthorizedCredential({...recipient,expiresAt:now})).toBe(false);
  expect(canDownloadAuthorizedCredential({...recipient,revokedAt:now})).toBe(false);
 });
});

describe("current transfer authority at disclosure",()=>{
 const valid={
  consentActive:true,consentMatchesStudent:true,consentMatchesGuardian:true,
  consentMatchesAction:true,consentMatchesDestination:true,consentMatchesProgram:true,
  relationshipActive:true,actionResolved:true,actionMatchesStudent:true,
  actionMatchesGuardian:true,actionMatchesConsent:true,actionCompleted:true,
  issuerMatches:true,
 };
 it("permits only a fully current authorization",()=>expect(canRedeemTransferCredential(valid)).toBe(true));
 it.each(Object.keys(valid) as Array<keyof typeof valid>)("denies when %s changes",key=>{
  expect(canRedeemTransferCredential({...valid,[key]:false})).toBe(false);
 });
 it("denies canceled or reopened transfer after approval",()=>{
  expect(canRedeemTransferCredential({...valid,actionResolved:false})).toBe(false);
  expect(canRedeemTransferCredential({...valid,actionCompleted:false})).toBe(false);
 });
 it("denies consent revocation and guardian privilege loss after approval",()=>{
  expect(canRedeemTransferCredential({...valid,consentActive:false})).toBe(false);
  expect(canRedeemTransferCredential({...valid,relationshipActive:false})).toBe(false);
 });
});

describe("official transcript issuance freshness",()=>{
 it("allows exact latest issuance",()=>expect(isLatestTranscriptIssuance("issued-2","issued-2")).toBe(true));
 it("rejects replaced issuance",()=>expect(isLatestTranscriptIssuance("issued-1","issued-2")).toBe(false));
 it("rejects deleted or missing issuance",()=>expect(isLatestTranscriptIssuance("issued-1",null)).toBe(false));
});

describe("consent-bound release replay",()=>{
 it("blocks revoked grant replay with same consent",()=>expect(canReauthorizeCredentialRelease(true)).toBe(false));
 it("permits independent re-review after expiry without revocation",()=>expect(canReauthorizeCredentialRelease(false)).toBe(true));
});

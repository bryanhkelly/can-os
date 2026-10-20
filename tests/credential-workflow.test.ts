import { describe, expect, it } from "vitest";
import { credentialStatusFromDecision, decideCredentialReview } from "../src/domain/credential-workflow";
const date=new Date("2026-10-15T12:00:00Z");
const record={status:"pending" as const,subjectPersonId:"teacher",evidenceDocumentId:"file-1",expiry:new Date("2027-03-01")};
describe("credential verification lifecycle",()=>{
 it.each([
  [undefined,"unverified"],[null,"unverified"],["submit","pending"],
  ["approve","verified"],["reject","rejected"],["revoke","revoked"],
 ])("derives status from the persisted decision %s",(decision,status)=>{
  expect(credentialStatusFromDecision(decision)).toBe(status);
 });
 it.each(["approved","verified","unknown",""])("rejects unsupported persisted decision %s",decision=>{
  expect(()=>credentialStatusFromDecision(decision)).toThrow("Unsupported credential verification decision");
 });
 it("requires independent reviewer and evidence",()=>{
  expect(()=>decideCredentialReview(record,"approve","teacher",date)).toThrow();
  expect(()=>decideCredentialReview({...record,evidenceDocumentId:null},"approve","reviewer",date)).toThrow();
 });
 it("approves valid submitted evidence",()=>{
  const approved=decideCredentialReview(record,"approve","reviewer",date);
  expect(approved.status).toBe("verified");
  expect(approved.verifiedAt).toEqual(date);
 });
 it("rejects expired evidence and duplicate decisions",()=>{
  expect(()=>decideCredentialReview({...record,expiry:new Date("2025-01-01")},"approve","reviewer",date)).toThrow();
  expect(()=>decideCredentialReview({...record,status:"verified"},"approve","reviewer",date)).toThrow();
 });
 it("requires reviewer reason for rejection and revocation",()=>{
  expect(()=>decideCredentialReview(record,"reject","reviewer",date)).toThrow();
  expect(decideCredentialReview(record,"reject","reviewer",date,"Document illegible").status).toBe("rejected");
 });
});

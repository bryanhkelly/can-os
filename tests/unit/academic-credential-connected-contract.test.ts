import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Source-level disclosure boundary contract; connected DB/browser tests remain required. */
describe("connected official credential disclosure", () => {
 const source=readFileSync(resolve(process.cwd(),"src/modules/learning/academic-credential-delivery.functions.ts"),"utf8");
 const render=source.split("export const renderAcademicCredential=")[1]?.split("/** A registrar can authorize")[0]??"";
 const authorize=source.split("export const authorizeAcademicCredentialRelease=")[1]?.split("/** Verified account candidates")[0]??"";
 const recipient=source.split("export const downloadAuthorizedAcademicCredential=")[1]?.split("/** The authenticated recipient can discover")[0]??"";
 const transcriptGuard="await assertOfficialTranscriptFreshForAuthorizedRelease(tx,s,";
 const diplomaGuard="await assertDiplomaFreshForAuthorizedRelease(tx,s,";
 const order=(body:string,first:string,second:string)=>{
  expect(body.indexOf(first)).toBeGreaterThan(-1);
  expect(body.indexOf(second)).toBeGreaterThan(-1);
  expect(body.indexOf(first)).toBeLessThan(body.indexOf(second));
 };

 it("keeps issuer scope, both canonical freshness checks and registrar PDF inside the transaction",()=>{
  expect(render).toContain("return db.transaction(async tx=>");
  expect(render).toContain("context.scope.organizationIds?.includes(doc.issuerId)");
  expect(render).toContain(diplomaGuard);
  expect(render).toContain(transcriptGuard);
  order(render,"return db.transaction(async tx=>",transcriptGuard);
  order(render,transcriptGuard,"const pdf=academicDocumentPdf(doc)");
  order(render,diplomaGuard,"const pdf=academicDocumentPdf(doc)");
  expect(render).toContain("const lockedDoc=await documentData(tx as unknown as typeof db,s,data.kind,data.credentialId)");
  expect(render.indexOf("const lockedDoc=")).toBeGreaterThan(render.indexOf(diplomaGuard));
  expect(render.indexOf("const lockedDoc=")).toBeGreaterThan(render.indexOf(transcriptGuard));
  order(render,"doc=lockedDoc","const pdf=academicDocumentPdf(doc)");
  expect(render).toContain("lockedDoc.issuerId!==doc.issuerId");
  order(render,"const pdf=academicDocumentPdf(doc)","return {filename:");
  // Match the closing boundary of the transaction rather than the FIRST
  // occurrence of '});', which also appears inside freshness calls.
  expect(render.lastIndexOf("});")).toBeGreaterThan(render.indexOf("return {filename:"));
 });

 it("fails closed on corrected/withdrawn/superseded transcripts before grant reuse or creation",()=>{
  expect(authorize).toContain("return db.transaction(async tx=>");
  order(authorize,"return db.transaction(async tx=>",transcriptGuard);
  order(authorize,transcriptGuard,"const [existing]=await tx.select(");
  order(authorize,transcriptGuard,"const [created]=await tx.insert(");
  expect(authorize).toContain("liveConsent.revokedAt");
  expect(authorize).toContain("liveRecipientAccount");
  expect(authorize).toContain("const [liveRecipientPerson]=await tx.select(");
  expect(authorize).toContain("!liveRecipientPerson?.active");
  expect(authorize).toContain("liveRecipientPerson.email?.trim().toLowerCase()");
  expect(authorize).toContain("const [liveProgram]=await tx.select(");
  expect(authorize).toContain("liveProgram?.issuerId!==doc.issuerId");
  expect(authorize).toContain("const [liveStudent]=await tx.select(");
  expect(authorize).toContain("liveStudent.personId!==student.personId");
  expect(authorize).toContain('liveAction?.type!=="guardian_enrollment_change_request"');
  expect(authorize).toContain('liveAction.subjectType!=="student_profile"');
  expect(authorize).toContain('liveConsent.consentType!=="academic_records_transfer_release"');
  expect(authorize).toContain('liveAction.metadata.kind!=="transfer"');
  order(authorize,"const [liveStudent]=",transcriptGuard);
 });

 it("holds verified recipient, grant and canonical source checks through PDF rendering",()=>{
  expect(recipient).toContain("return db.transaction(async tx=>");
  expect(recipient).toContain('.for("update").limit(1)');
  expect(recipient).toContain("isNotNull(s.accessAccounts.emailVerifiedAt)");
  expect(recipient).toContain("eq(s.accountPersonGrants.isSynthetic,false)");
  expect(recipient).toContain('release.releasePurpose!=="transfer"');
  expect(recipient).toContain('.from(s.programs).where(eq(s.programs.id,action.programId)).for("share").limit(1)');
  order(recipient,"return db.transaction(async tx=>",transcriptGuard);
  order(recipient,transcriptGuard,"const pdf=academicDocumentPdf(doc)");
  expect(recipient).toContain('.from(s.people).where(eq(s.people.id,recipientPersonId)).for("share").limit(1)');
  expect(recipient).toContain("const lockedDoc=await documentData(tx as unknown as typeof db,s,kind,credentialId)");
  expect(recipient.indexOf("const lockedDoc=")).toBeGreaterThan(recipient.indexOf(transcriptGuard));
  order(recipient,"doc=lockedDoc","const pdf=academicDocumentPdf(doc)");
  expect(recipient).toContain("lockedDoc.studentProfileId!==doc.studentProfileId");
  order(recipient,"const pdf=academicDocumentPdf(doc)","academic_credential.release.download");
  expect(recipient.lastIndexOf("});")).toBeGreaterThan(recipient.indexOf("return {filename:"));
 });

 it("uses the A-owned guard at all three disclosure boundaries, with no latest-only fallback",()=>{
  expect((source.match(/await assertOfficialTranscriptFreshForAuthorizedRelease\(/g)??[])).toHaveLength(3);
  expect(source).toContain('from "@/modules/learning/academic-credential-freshness.server"');
  expect(source).not.toContain("assertLatestTranscriptIssuance");
  expect(source).not.toContain("isLatestTranscriptIssuance");
 });

 it("does not permit direct email PDF attachment delivery",()=>{
  expect(source).toContain("Credential release is unavailable pending verified recipient authorization");
 });
});

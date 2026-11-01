import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Source-level guard for the registrar disclosure transaction contract.
 * Live database concurrency and tenant acceptance remain separately required.
 */
describe("connected official credential disclosure", () => {
 const source=readFileSync(resolve(process.cwd(),"src/modules/learning/academic-credential-delivery.functions.ts"),"utf8");
 const render=source.split("export const renderAcademicCredential=")[1]?.split("/** A registrar can authorize")[0]??"";
 const recipient=source.split("export const downloadAuthorizedAcademicCredential=")[1]?.split("export const listMyAcademicCredentialReleases")[0]??"";
 it("keeps issuer scope, authoritative diploma freshness and PDF bytes inside one transaction",()=>{
  expect(render).toContain("return db.transaction(async tx=>");
  expect(render).toContain("context.scope.organizationIds?.includes(doc.issuerId)");
  expect(render).toContain("await assertDiplomaFreshForAuthorizedRelease(tx,s,");
  expect(render.indexOf("assertDiplomaFreshForAuthorizedRelease")).toBeLessThan(render.indexOf("academicDocumentPdf(doc)"));
  expect(render.indexOf("academicDocumentPdf(doc)")).toBeLessThan(render.indexOf("});"));
 });
 it("requires a verified authenticated recipient and active locked authorization",()=>{
  expect(recipient).toContain("return db.transaction(async tx=>");
  expect(recipient).toContain('.for("update").limit(1)');
  expect(recipient).toContain("isNotNull(s.accessAccounts.emailVerifiedAt)");
  expect(recipient).toContain("eq(s.accountPersonGrants.isSynthetic,false)");
  expect(recipient).toContain("assertLatestTranscriptIssuance(");
  expect(recipient).toContain('release.releasePurpose!=="transfer"');
 });
 it("does not permit direct email PDF attachment delivery",()=>{
  expect(source).toContain("Credential release is unavailable pending verified recipient authorization");
 });
});

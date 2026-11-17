import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source=(path:string)=>readFileSync(path,"utf8");
const operatorRead=source("src/modules/learning/noncredit-completion-review.functions.ts");
const operatorPanel=source("src/components/learning/NoncreditCompletionReviewPanel.tsx");
const canonicalClassRead=source("src/modules/classes/native-class-canonical-evidence.functions.ts");
const canonicalClassPanel=source("src/components/learning/NativeClassCanonicalEvidencePanel.tsx");
const preflight=source("scripts/acceptance/check-ws3-completion-readiness.mjs");

describe("WS3 completion read and operator controls",()=>{
  it("keeps operator history view behind a current grant, exact Site and disabled flag",()=>{
    expect(operatorRead).toContain("CAN_WS3_OPERATOR_REVIEW_ENABLED");
    expect(operatorRead).toContain('assertCapability(actor,"noncredit.completion.decide")');
    expect(operatorRead).toContain("assertNoncreditCompletionSiteScope");
    expect(operatorRead).toContain("projectCurrentNoncreditCompletion");
    expect(operatorRead).toContain("completion history pagination required");
  });
  it("exposes correction from an explicit record and independently verified evidence",()=>{
    expect(operatorPanel).toContain("getNoncreditCompletionReview");
    expect(operatorPanel).toContain("correctNoncreditCompletion");
    expect(operatorPanel).toContain("current.decisionId");
    expect(operatorPanel).toContain("evidenceVersionId");
    expect(operatorPanel).toContain("reason.trim()");
  });
  it("never marks Class outcomes as policy-verified without the missing authority",()=>{
    expect(canonicalClassRead).toContain("CAN_WS3_NATIVE_CLASS_COMPLETION_ENABLED");
    expect(canonicalClassRead).toContain("classCompletionAuthorityVerified=validity.rows[0]?.valid===true");
    expect(canonicalClassPanel).toContain('?"Verified":"Not verified"');
    expect(canonicalClassPanel).toContain("independent policy-backed decision is not yet verified");
    expect(operatorPanel).not.toContain("canonicalClassAwards");
  });
  it("makes the database preflight explicitly read-only and opt-in",()=>{
    expect(preflight).toContain('CAN_WS3_SCHEMA_VALIDATION');
    expect(preflight).toContain("BEGIN READ ONLY");
    expect(preflight).not.toContain("INSERT INTO");
    expect(preflight).not.toContain("CREATE TABLE");
  });
});

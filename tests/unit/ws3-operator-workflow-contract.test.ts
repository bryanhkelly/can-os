import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
const source=(file:string)=>readFileSync(file,"utf8");
const noncredit=source("src/components/learning/NoncreditCompletionReviewPanel.tsx");
const classUi=source("src/components/learning/NativeClassCompletionOperatorPanel.tsx");
const approvals=source("src/components/learning/CompletionEvidenceReviewQueuePanel.tsx");
const route=source("src/routes/canonical.completion-evidence-reviews.tsx");
const nativeRoute=source("src/routes/class_.$classId.tsx");
const review=source("src/modules/learning/completion-evidence-review.functions.ts");
const revocation=source("src/modules/learning/credential-revocation.functions.ts");
const gate=source("scripts/acceptance/check-ws3-merge-gate.mjs");
const qa=source("scripts/acceptance/dry-run-ws3-migrations.mjs");

describe("WS3 full operator approval, correction and revocation workflow",()=>{
  it("noncredit correction must request independent exact-decision evidence first",()=>{
    expect(noncredit).toContain("requestCompletionEvidenceReview");
    expect(noncredit).toContain('purpose:"completion_correction"');
    expect(noncredit).toContain("expectedDecisionId");
    expect(noncredit).toContain("approvedOutcome:outcome");
    expect(noncredit).toContain("Request independent approval");
    expect(noncredit).toContain("correctNoncreditCompletion");
  });
  it("independent cross-source reviewer queue has a protected route",()=>{
    expect(route).toContain('createFileRoute("/canonical/completion-evidence-reviews")');
    expect(route).toContain("CompletionEvidenceReviewQueuePanel");
    expect(approvals).toContain("getPendingCompletionEvidenceReviews");
    expect(approvals).toContain("decideCompletionEvidenceReview");
    expect(approvals).toContain("Approve independent evidence");
    expect(approvals).toContain("Reject");
    expect(approvals).toContain("page+1");
    expect(review).toContain("assertPurposeCapability");
    expect(review).toContain("assertCurrentCanonicalStaffForMutation");
  });
  it("revocation requires independently approved exact issuance, not Site Admin alone",()=>{
    expect(approvals).toContain('purpose:"award_revocation"');
    expect(approvals).toContain("requestCompletionEvidenceReview");
    expect(approvals).toContain("revokeLearningAwardIssuance");
    expect(approvals).toContain("issuer authority");
    expect(revocation).toContain("assertCurrentCredentialIssuer");
    expect(revocation).toContain("assertSourceBoundCompletionEvidence");
  });
  it("Class workflow separately publishes, reviews and records original source outcome",()=>{
    expect(source("src/routes/class_.$classId.tsx")).toContain("NativeClassCompletionOperatorPanel");
    expect(nativeRoute).toContain("NativeClassCompletionOperatorPanel");
    expect(classUi).toContain("Publish reviewed policy");
    expect(classUi).toContain("Request independent approval");
    expect(classUi).toContain("Record formal decision");
  });
  it("merge gate requires TypeScript, WS3 regressions and no production mutation",()=>{
    expect(gate).toContain('["npm",["run","typecheck"]]');
    expect(gate).toContain('"tests/unit/ws3-evidence-review-and-class-current.test.ts"');
    expect(qa).toContain('CAN_WS3_QA_BRANCH!=="test01"');
    expect(qa).toContain("ROLLBACK TO SAVEPOINT ws3_migration_dry_run");
    expect(qa).toContain('client.query("ROLLBACK")');
    expect(qa).toContain("historyImmutable");
    expect(qa).toContain("EXCEPTION WHEN check_violation");
    expect(qa).toContain("Governed Class history was mutable");
    expect(qa).not.toContain(String.fromCharCode(92,96));
    expect(qa).not.toContain('client.query("COMMIT")');
  });
});

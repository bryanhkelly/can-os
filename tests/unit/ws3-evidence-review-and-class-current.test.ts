import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(path:string)=>readFileSync(path,"utf8");
const reviewSql=read("database/canonical/v3.0.1/patch-ws3-independent-evidence-review.sql");
const reviewedSql=read("database/canonical/v3.0.1/patch-ws3-source-bound-evidence.sql");
const classSql=read("database/canonical/v3.0.1/patch-ws3-class-governed-outcomes.sql");
const reviewService=read("src/modules/learning/completion-evidence-review.server.ts");
const classService=read("src/modules/classes/native-class-completion.server.ts");
const classOperator=read("src/components/learning/NativeClassCompletionOperatorPanel.tsx");
const classRoute=read("src/routes/class_.$classId.tsx");
const learnerSource=read("src/modules/classes/native-class-canonical-evidence.functions.ts");
const preflight=read("scripts/acceptance/check-ws3-completion-readiness.mjs");

describe("WS3 independent evidence reviewer workflow",()=>{
  it("persists source-specific requests, never a second outcome or credential",()=>{
    expect(reviewSql).toContain("learning_completion_evidence_review_requests");
    expect(reviewSql).toContain("ws3_review_one_source");
    expect(reviewSql).toContain("ws3_review_independent");
    expect(reviewSql).toContain("Only independent final review transition");
    expect(reviewSql).toContain("FORCE ROW LEVEL SECURITY");
    expect(reviewSql).toContain("REVOKE ALL");
    expect(reviewSql).not.toContain("CREATE TABLE education_v30.class_outcomes");
    expect(reviewedSql).toContain("learning_completion_evidence_bindings");
  });
  it("must resolve Person, Org and Site from canonical source, never client",()=>{
    expect(reviewService).toContain("noncredit_registrations r");
    expect(reviewService).toContain("class_enrollments e");
    expect(reviewService).toContain("learning_award_issuances issuance");
    expect(reviewService).toContain("participation_attributions attribution");
    expect(reviewService).toContain("actor.scope.siteIds[0]!==target.deliverySiteId");
    expect(reviewService).toContain("assertVerifiedEvidence");
    expect(reviewService).toContain("submittedByPersonId:record.submittedByPersonId");
  });
  it("requires independent staff session and separately approved issuer for awards",()=>{
    expect(reviewService).not.toContain("CAN_WS3_EVIDENCE_REVIEW_ENABLED");
    expect(reviewService).toContain("assertCurrentCanonicalStaffForMutation(tx,request,actor)");
    expect(reviewService).toContain("assertCurrentCredentialIssuer(tx,request,actor)");
    expect(reviewService).toContain("actor.actorPersonId===record.submittedByPersonId");
    expect(reviewService).toContain("learningCompletionEvidenceBindings");
    expect(reviewService).toContain("CompletionEvidenceReviewDecided");
  });
  it("exposes only same-Site purpose-authorized pending requests",()=>{
    expect(reviewService).toContain("allowedPurposes");
    expect(reviewService).toContain("inArray(learningCompletionEvidenceReviewRequests.purpose,allowedPurposes)");
    expect(reviewService).toContain("eq(learningCompletionEvidenceReviewRequests.deliverySiteId");
  });
  it("provides a source-verified Class operator queue and 6.1 review surface",()=>{
    expect(classService).toContain("getNativeClassCompletionQueue");
    expect(classService).toContain("await collectReadiness(tx,source)");
    expect(classService).toContain("getNativeClassCompletionReview");
    expect(classOperator).toContain("Request independent approval");
    expect(classOperator).toContain("Record formal decision");
    expect(classOperator).toContain("getPendingCompletionEvidenceReviews");
    expect(classRoute).toContain("createFileRoute");
    expect(read("src/routes/class_.$classId.tsx")).toContain("NativeClassCompletionOperatorPanel");
    expect(classRoute).toContain("NativeClassCompletionOperatorPanel");
  });
  it("does not claim verified learner completion until current canonical function agrees",()=>{
    expect(learnerSource).not.toContain("CAN_WS3_NATIVE_CLASS_COMPLETION_ENABLED");
    expect(learnerSource).toContain("v301_ws3_class_completion_is_current");
    expect(classSql).toContain("NOT policy.require_all_lessons");
    expect(classSql).toContain("policy.required_verified_sessions=0");
    expect(classSql).toContain("NOT policy.require_passing_assessment");
    expect(classSql).toContain("newer.result_revision>r.result_revision");
    expect(classSql).toContain("latest.status='present'");
    expect(classSql).toContain("newer.supersedes_outcome_id=o.id");
  });
  it("keeps the staged schema checks opt-in with no production activation",()=>{
    expect(preflight).toContain("CAN_WS3_REQUIRE_PROPOSED_SCHEMA");
    expect(preflight).toContain("ws3_review_request_mutation_guard");
    expect(preflight).toContain("ws3_class_completion_decision_insert_guard");
    expect(preflight).toContain("checks_class_completion_current");
    expect(preflight).toContain("BEGIN READ ONLY");
  });
});

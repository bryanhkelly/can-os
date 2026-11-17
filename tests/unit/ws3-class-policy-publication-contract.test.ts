import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const file=(path:string)=>readFileSync(path,"utf8");

const publish=file("src/modules/classes/native-class-completion-policy.functions.ts");
const ui=file("src/components/learning/NativeClassCompletionOperatorPanel.tsx");
const classSql=file("database/canonical/v3.0.1/patch-ws3-class-completion-policy-pins.sql");
const evidenceReview=file("src/modules/learning/completion-evidence-review.functions.ts");

describe("WS3 Class completion policy publication",()=>{
  it("requires independent exact-Site staff and correct Class creator authority",()=>{
    expect(publish).not.toContain("CAN_WS3_CLASS_POLICY_PUBLICATION_ENABLED");
    expect(publish).not.toContain("CAN_UNIFIED_CLASS_COMMANDS_ENABLED");
    expect(publish).toContain("assertCapability(actor,\"class.manage\")");
    expect(publish).toContain("cls.createdByPersonId===actor.actorPersonId");
    expect(publish).toContain("validateClassAuthority");
    expect(publish).toContain("assertCurrentCanonicalStaffForMutation");
  });
  it("publishes only immutable meaningful versioned policies using verified evidence",()=>{
    expect(publish).toContain("expectedLatestVersion");
    expect(publish).toContain("latest?.versionNo??null");
    expect(publish).toContain("classCompletionPolicyVersions");
    expect(publish).toContain("evidence.verifiedByPersonId===actor.actorPersonId");
    expect(publish).toContain("evidence.verifiedByPersonId===cls.createdByPersonId");
    expect(publish).toContain("effectiveAt.getTime()<now.getTime()-1000");
    expect(publish).toContain("future_enrollments");
    expect(classSql).toContain("ws3_class_policy_nonempty_requirements");
    expect(classSql).toContain("ws3_class_completion_policy_guard_trg");
    expect(classSql).toContain("p.effective_at<=NEW.enrolled_at");
  });
  it("never reassigns an existing enrollment or issues a Class award",()=>{
    expect(publish).not.toContain("canonicalClassAwards");
    expect(publish).not.toContain("classEnrollmentCompletionPins");
    expect(publish).not.toContain("update(canonicalClassEnrollments)");
    expect(ui).toContain("Publish reviewed policy");
    expect(ui).toContain("latestCompletionPolicyVersion");
  });
  it("does not let the same Site role review its own submitted evidence",()=>{
    expect(evidenceReview).toContain("actor.actorPersonId===record.submittedByPersonId");
    expect(evidenceReview).toContain("assertCurrentCanonicalStaffForMutation");
    expect(evidenceReview).toContain("CompletionEvidenceReviewRequested");
    expect(evidenceReview).toContain("learningCompletionEvidenceBindings");
  });
});

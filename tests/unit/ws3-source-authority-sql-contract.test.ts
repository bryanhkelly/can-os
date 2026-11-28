import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file=(name:string)=>readFileSync(name,"utf8");
const subjectSql=file("database/canonical/v3.0.1/patch-ws3-source-bound-evidence.sql");
const classSql=file("database/canonical/v3.0.1/patch-ws3-class-completion-policy-pins.sql");
const credentialSql=file("database/canonical/v3.0.1/patch-achievement-credentials-hardening.sql");
const readerSql=file("database/canonical/v3.0.1/patch-credential-learner-reader.sql");
const sourceGuard=file("src/modules/learning/verified-completion-evidence.server.ts");
const corrections=file("src/modules/learning/noncredit-completion-corrections.server.ts");
const revocations=file("src/modules/learning/credential-revocation.server.ts");
const operatorRead=file("src/modules/learning/noncredit-completion-review.server.ts");
const learnerRead=file("src/modules/learning/learner-credentials.server.ts");

describe("WS3 completion evidence source and credential-current contracts",()=>{
  it("preserves immutably approved source/Person/decision binding with forced RLS",()=>{
    expect(subjectSql).toContain("CREATE TABLE IF NOT EXISTS education_v30.learning_completion_evidence_bindings");
    expect(subjectSql).toContain("expected_decision_id uuid REFERENCES");
    expect(subjectSql).toContain("approved_correction_outcome");
    expect(subjectSql).toContain("noncredit_completion_decisions prior");
    expect(subjectSql).toContain("WS3 reviewed evidence bindings are immutable");
    expect(subjectSql).toContain("ROW(target_person,target_org,target_site)");
    expect(subjectSql.match(/INTO STRICT target_person,target_org,target_site/g)).toHaveLength(3);
    expect(subjectSql).toContain("FORCE ROW LEVEL SECURITY");
    expect(subjectSql).toContain("REVOKE ALL");
    expect(subjectSql).toContain("FOR ALL TO neondb_owner");
  });
  it("does not allow unbound generic evidence documents to mutate decisions or awards",()=>{
    expect(sourceGuard).toContain("matchesApprovedEvidenceBinding");
    expect(sourceGuard).toContain("learningCompletionEvidenceBindings");
    expect(sourceGuard).toContain("evidence.verifiedAt>bound.approvedAt");
    expect(corrections).toContain("assertSourceBoundCompletionEvidence(tx");
    expect(corrections).toContain("expectedDecisionId:data.expectedCurrentDecisionId");
    expect(corrections).toContain("approvedCorrectionOutcome:data.outcome");
    expect(revocations).toContain("assertSourceBoundCompletionEvidence(tx");
    expect(revocations).toContain("issuanceId:issuance.id");
    expect(revocations).toContain("assertCurrentCredentialIssuer(tx,request,actor)");
    expect(corrections).toContain("assertCurrentCanonicalStaffForMutation");
  });
  it("uses canonical issuance validity after a completion is corrected",()=>{
    expect(credentialSql).toContain("completion.outcome='completed'");
    expect(credentialSql).toContain("WHERE newer.supersedes_id=completion.id");
    expect(credentialSql).toContain("event_kind='revoked'");
    expect(credentialSql).toContain("legacy.status='issued'");
    expect(readerSql).toContain("v301_credential_is_current(issuance.id)");
    expect(readerSql).toContain("AND v301_credential_is_current(issuance.id)");
    expect(learnerRead).toContain("v301_list_my_learning_awards");
    expect(learnerRead).toContain("v301_get_my_learning_award");
    expect(operatorRead).toContain("v301_credential_is_current(issuance.id)");
    expect(operatorRead).not.toContain("certificate.status='issued' AS");
  });
  it("retains decisions as independent historical records and rejects ambiguous heads",()=>{
    expect(corrections).toContain("projectCurrentNoncreditCompletion");
    expect(corrections).toContain('projected.state==="unavailable"');
    expect(corrections).toContain("supersedesId: current.id");
  });
});
describe("WS3 Class policy source-of-truth and no backdating",()=>{
  it("pins a policy only at first insertion and never through a changed offering",()=>{
    expect(classSql).toContain("AFTER INSERT ON education_v30.class_enrollments");
    expect(classSql).toContain("SECURITY DEFINER");
    expect(classSql).toContain("REVOKE ALL ON FUNCTION education_v30.ws3_pin_class_policy_on_enrollment()");
    expect(classSql).toContain("p.published_at<=NEW.enrolled_at");
    expect(classSql).toContain("p.effective_at<=NEW.enrolled_at");
    expect(classSql).toContain("completion_policy_version_id");
    expect(classSql).toContain("Published Class completion policy is immutable");
    expect(classSql).toContain("Participant Class completion-policy pin is immutable");
    expect(classSql).not.toContain("UPDATE education_v30.class_enrollments");
  });
  it("requires independent approval, meaningful policy and owner-only forced RLS",()=>{
    expect(classSql).toContain("authored_by_person_id<>approved_by_person_id");
    expect(classSql).toContain("ws3_class_policy_nonempty_requirements");
    expect(classSql).toContain("approved_policy_evidence_version_id");
    expect(classSql).toContain("FORCE ROW LEVEL SECURITY");
    expect(classSql).toContain("FOR ALL TO neondb_owner");
    expect(classSql).not.toContain("INSERT INTO education_v30.class_outcomes");
    expect(classSql).not.toContain("INSERT INTO education_v30.class_awards");
  });
});

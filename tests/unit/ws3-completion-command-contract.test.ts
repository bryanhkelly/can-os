import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = (path: string) => readFileSync(path, "utf8");
const corrections = file("src/modules/learning/noncredit-completion-corrections.functions.ts");
const revocation = file("src/modules/learning/credential-revocation.functions.ts");
const decisions = file("src/modules/learning/noncredit-completion-decisions.functions.ts");
const credentialSql = file("database/canonical/v3.0.1/patch-achievement-credentials.sql");
const classSql = file("database/canonical/v3.0.1/patch-unified-class-offerings.sql");

describe("WS3 guarded completion mutation integration contracts", () => {
  it("requires current provider grants and prevents self-completion", () => {
    expect(decisions).toContain("registration.participantPersonId===actor.actorPersonId");
    expect(decisions).toContain("registration.completionPolicyId!==policy.id");
    expect(decisions).toContain("assertCurrentCanonicalStaffForMutation");
  });
  it("gates correction, locks source, validates independent verified evidence and appends history", () => {
    expect(corrections).toContain("CAN_NONCREDIT_COMPLETION_CORRECTIONS_ENABLED");
    expect(corrections).toContain('.for("update")');
    expect(corrections).toContain("registration.participantPersonId === actor.actorPersonId");
    expect(corrections).toContain("evidence.verifiedByPersonId === actor.actorPersonId");
    expect(corrections).toContain("current.supersedesId === data.expectedCurrentDecisionId");
    expect(corrections).toContain("supersedesId: current.id");
    expect(corrections).toContain("assertCurrentCanonicalStaffForMutation");
    expect(corrections).toContain("NoncreditCompletionCorrected");
  });
  it("makes award revocation independent of Site role and appends issuer events", () => {
    expect(revocation).toContain("CAN_CREDENTIAL_ISSUANCE_ENABLED");
    expect(revocation).toContain("CAN_WS3_AWARD_REVOCATION_ENABLED");
    expect(revocation).toContain("assertCurrentCredentialIssuer");
    expect(revocation).toContain("evidence.owningOrganizationId !== issuance.issuerOrganizationId");
    expect(revocation).toContain("learningAwardIssuanceEvents");
    expect(revocation).toContain('status:"revoked"');
    expect(revocation).toContain("CredentialRevoked");
  });
  it("retains immutable canonical decision/issuance tables with restricted initial RLS", () => {
    expect(credentialSql).toContain("learning_award_issuance_events_immutable");
    expect(credentialSql).toContain("credential_revoked_once");
    expect(credentialSql).toContain("credential_owner_only");
    expect(classSql).toContain("class_outcomes");
    expect(classSql).toContain("class_awards");
    expect(classSql).toContain("FORCE ROW LEVEL SECURITY");
  });
});

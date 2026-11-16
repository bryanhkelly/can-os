import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalRoleCapabilities } from "@/domain/canonical-access";

function file(name:string){
  return readFileSync(resolve(name),"utf8");
}

describe("P0 independent credential issuer authorization",()=>{
  it("neither Site Admin nor Registrar automatically receives issuance authority",()=>{
    for(const role of ["site_admin","registrar"] as const){
      expect(canonicalRoleCapabilities[role]).toContain("credential.preview");
      expect(canonicalRoleCapabilities[role]).not.toContain("credential.issue");
    }
    const issuance=file("src/modules/learning/credential-issuance.functions.ts");
    expect(issuance).toContain('CAN_CREDENTIAL_ISSUANCE_ENABLED !== "true"');
    expect(issuance).toContain("assertCurrentCredentialIssuer(tx,getRequest(),actor)");
    expect(issuance).not.toContain('assertCapability(actor, "credential.issue")');
  });
  it("only an existing verified CAN login can hold active issuance authority",()=>{
    const authorization=file("src/modules/identity/canonical-sensitive-authorization.server.ts");
    expect(authorization).toContain("assertCurrentCanonicalStaffForMutation");
    expect(authorization).toContain("accessSessionCookie");
    expect(authorization).toContain("v301_can_staff_session_context");
    expect(authorization).toContain("v301_can_sensitive_capability");
    expect(authorization).toContain("FOR SHARE OF approval");
    expect(authorization).not.toContain("canonicalSessionCookie");
  });
  it("sensitive capability checks are restricted, revocable and time bounded",()=>{
    const sql=file("database/canonical/v3.0.1/patch-sensitive-credential-issuer-approvals.sql");
    for(const marker of [
      "SECURITY DEFINER",
      "p_can_session_hash text",
      "capability_code = 'credential.issue'",
      "approval.status='approved'",
      "approval.approved_until > clock_timestamp()",
      "approval.revoked_at IS NULL",
      "reviewed_by_can_account_id <>",
      "requested_by_can_account_id",
      "REVOKE ALL ON FUNCTION",
      "TO can_v30_canonical_auth_reader",
      "ENABLE ROW LEVEL SECURITY",
      "FORCE ROW LEVEL SECURITY",
      "sensitive_approvals_open_grant_uq",
    ]) expect(sql).toContain(marker);
    expect(sql).not.toContain("GRANT SELECT ON education_v30.canonical_sensitive_capability_approvals");
  });
  it("separates staff requests from reviewer decisions and revocation",()=>{
    const service=file("src/modules/identity/canonical-sensitive-approvals.functions.ts");
    expect(service).toContain("requestCanonicalCredentialIssuerApproval");
    expect(service).toContain("reviewCanonicalCredentialIssuerApproval");
    expect(service).toContain("revokeCanonicalCredentialIssuerApproval");
    expect(service).toContain("assertCANIdentityReviewer(reviewer,organization)");
    expect(service).toContain("approval.requestedByCanAccountId===reviewer.accountId");
    expect(service).toContain("requesterMembership[0]?.personId===reviewer.actorPersonId");
    expect(service).toContain("assertCurrentReviewerInTransaction(tx,reviewer)");
    expect(service).toContain('grant_row.role=\'can_network_steward\'');
    expect(service).toContain("FOR SHARE OF s,account,grant_row,organization,person");
    expect(service).toContain("reviewEvidenceReference:data.evidenceReference");
    expect(service).toContain("expiresAt.getTime()>now.getTime()+366");
  });
  it("retains a clear one-login governed UI and rollback-only acceptance",()=>{
    const route=file("src/routes/canonical.issuer-access.tsx");
    expect(route).toContain('createFileRoute("/canonical/issuer-access")');
    expect(route).toContain("Request authority");
    expect(route).toContain("Independent review");
    expect(route).toContain("Revoke authority");
    const test=file("database/canonical/v3.0.1/accept-sensitive-credential-issuer-test01.sql");
    expect(test).toContain("role alone granted issuer capability");
    expect(test).toContain("pending issuer request granted authority");
    expect(test).toContain("independent active issuer authority not recognized");
    expect(test).toContain("expired issuer approval remains usable");
    expect(test).toContain("revoked issuer approval remains usable");
    expect(test).toContain("ROLLBACK TO SAVEPOINT");
  });
});

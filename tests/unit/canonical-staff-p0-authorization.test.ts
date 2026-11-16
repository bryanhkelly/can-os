import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalRoleCapabilities, projectCanonicalPrincipalContext,
} from "@/domain/canonical-access";
import { canResolveCanSiteStaff } from "@/domain/canonical-can-sso";

function source(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

const admin = {
  role: "site_admin",
  accountId: "test-can-account",
  actorPersonId: "test-can-person",
  grantSiteId: "test-can-site",
  sessionAccountId: undefined,
  scope: { organizationIds: ["test-can-org"], siteIds: ["test-can-site"] },
  capabilities: new Set<string>(),
};

describe("canonical single-login P0 authorization boundaries", () => {
  it("authenticates identity without an enrollment-specific capability", () => {
    expect(canResolveCanSiteStaff(admin)).toBe(true);
    expect(canResolveCanSiteStaff({...admin, role: "registrar"})).toBe(true);
    expect(canResolveCanSiteStaff({...admin, sessionAccountId: admin.accountId}))
      .toBe(false);
  });

  it("does not permit administrators to issue real credentials by role alone", () => {
    for (const role of ["site_admin", "registrar"] as const) {
      const capabilities = new Set(canonicalRoleCapabilities[role]);
      expect(capabilities.has("credential.preview")).toBe(true);
      expect(capabilities.has("credential.issue")).toBe(false);
      expect(capabilities.has("noncredit.enrollment.read")).toBe(true);
      expect(capabilities.has("noncredit.enrollment.manage")).toBe(true);
      expect(capabilities.has("blueprint.review")).toBe(false);
    }
    const preview = source("src/modules/learning/credential-preview.functions.ts");
    const issuance = source("src/modules/learning/credential-issuance.functions.ts");
    expect(preview).toContain('assertCapability(actor, "credential.preview")');
    expect(issuance).toContain("assertCurrentCredentialIssuer(tx,getRequest(),actor)");
    expect(issuance).not.toContain('assertCapability(actor, "credential.issue")');
    expect(issuance).toContain("assertCurrentCanonicalStaffForMutation");
  });

  it("retains strict learner and independent reviewer separation", () => {
    for (const role of ["learner", "blueprint_reviewer", "survey_reviewer"] as const) {
      const context = projectCanonicalPrincipalContext({
        person_id: "test-person",
        role_code: role,
        organization_id: "test-organization",
        site_id: null,
      });
      for (const denied of [
        "noncredit.enrollment.manage", "credential.issue",
        "noncredit.completion.decide", "blueprint.execute",
      ]) {
        expect(context.capabilities.has(denied)).toBe(false);
      }
    }
  });

  it("rechecks current CAN or native grant inside the mutation transaction", () => {
    const guard = source(
      "src/modules/identity/canonical-transaction-authorization.server.ts");
    expect(guard).toContain("v301_can_staff_session_context");
    expect(guard).toContain("v301_canonical_session_context");
    expect(guard).toContain("canonicalSessionDigestFromRequest");
    expect(guard).toContain("current canonical staff grant");
    expect(guard).toContain("unchanged exact canonical staff assignment");
    expect(guard).not.toContain("insert(canonicalAccountGrants)");
  });

  it("makes permission enforcement explicit on enrollment publication and cohorts", () => {
    const publication = source(
      "src/modules/enrollment/noncredit-enrollment-publication.functions.ts");
    expect(publication).toContain('requireCanonicalLabProvider("noncredit.enrollment.read")');
    expect((publication.match(/requireCanonicalLabProvider\("noncredit.enrollment.manage"\)/g)??[]).length)
      .toBe(3);
    expect((publication.match(/assertCurrentCanonicalStaffForMutation/g)??[]).length)
      .toBe(4); // import + three protected mutations
    expect(publication).toContain(
      "inArray(noncreditSelfEnrollmentReleases.siteId,provider.siteIds)");
    const cohorts=source("src/modules/enrollment/noncredit-cohort-operations.server.ts");
    const rpc=source("src/modules/enrollment/noncredit-cohort-operations.functions.ts");
    expect(cohorts).toContain(
      "if(lock)await assertCurrentCanonicalStaffForMutation(tx,getRequest(),provider.actor)");
    expect(rpc).not.toContain('from "@/modules/operations/canonical-capability-lab-access.server"');
    expect(rpc).toContain('await import("./noncredit-cohort-operations.server")');
    const decisions=source(
      "src/modules/learning/noncredit-completion-decisions.functions.ts");
    const policy=source(
      "src/modules/learning/noncredit-completion-policy.functions.ts");
    expect(decisions).toContain("assertCurrentCanonicalStaffForMutation(tx,getRequest(),actor)");
    expect(policy).toContain("assertCurrentCanonicalStaffForMutation(tx,getRequest(),actor)");
  });

  it("proves the restricted SQL reader cannot accept caller-selected roles or grants", () => {
    const sql = source(
      "database/canonical/v3.0.1/patch-can-staff-restricted-auth-reader.sql");
    expect(sql).toContain("p_can_session_hash text");
    expect(sql).toContain("s.secret_hash = p_can_session_hash");
    expect(sql).toContain("s.active_grant_id");
    expect(sql).toContain("source.can_role");
    expect(sql).toContain("person_link.revoked_at IS NULL");
    expect(sql).toContain("native_grant.revoked_at IS NULL");
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("REVOKE ALL ON FUNCTION");
    expect(sql).toContain("TO can_v30_canonical_auth_reader");
    const acceptance = source(
      "database/canonical/v3.0.1/accept-can-staff-restricted-auth-test01.sql");
    expect(acceptance).toContain("expected one verified Site Admin context");
    expect(acceptance).toContain("revoked session still has access");
    expect(acceptance).toContain("revoked school membership still has access");
    expect(acceptance).toContain("revoked Person link still has access");
    expect(acceptance).toContain("revoked Site link still has access");
    expect(acceptance).toContain("multi-Person account still has staff access");
    expect(acceptance).toContain("ROLLBACK TO SAVEPOINT");
  });
});

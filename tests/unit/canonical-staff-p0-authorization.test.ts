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
    expect(issuance).toContain("assertCurrentCredentialIssuer(tx, getRequest(), actor)");
    expect(issuance).toContain("assertNoncreditCompletionSiteScope(tx, actor, registration)");
    expect(issuance).toContain('process.env.CAN_CREDENTIAL_ISSUANCE_ENABLED !== "true"');
    expect(issuance).not.toContain('assertCapability(actor, "credential.issue")');
    expect(source("src/modules/identity/canonical-sensitive-authorization.server.ts"))
      .toContain("assertCurrentCanonicalStaffForMutation");
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
      .toBe(6); // three server-handler imports + three protected mutations
    expect(publication).toContain(
      "inArray(noncreditSelfEnrollmentReleases.siteId,provider.siteIds)");
    expect(publication).not.toContain('import { requireCanonicalLabProvider } from');
    expect(publication).toContain('await import("@/modules/operations/canonical-capability-lab-access.server")');
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

  it("derives staff roles only from the original current CAN grant",()=>{
    const ddl=source("database/production/2026-11-17-single-can-staff-projection.sql");
    const authority=source("src/modules/identity/can-site-staff-authority.server.ts");
    const reader=source("src/modules/identity/restricted-canonical-session-reader.server.ts");
    expect(ddl).toContain("p_can_session_hash text");
    expect(ddl).toContain("s.secret_hash = p_can_session_hash");
    expect(ddl).toContain("g.id AS can_grant_id");
    expect(ddl).toContain("g.id = s.active_grant_id");
    expect(ddl).toContain("a.person_id = g.person_id");
    expect(ddl).toContain("source.can_role");
    expect(ddl).toContain("person.active = true");
    expect(ddl).toContain("s.revoked_at IS NULL");
    expect(ddl).toContain("other_grant.person_id <> g.person_id");
    expect(ddl).not.toContain("person_link.");
    expect(ddl).not.toContain("native_grant.");
    expect(authority).toContain("native.grant_id !== actor.grantId");
    expect(authority).toContain("native.person_id !== actor.actorPersonId");
    expect(reader).toContain("SET LOCAL ROLE");
    expect(reader).toContain("BEGIN READ ONLY");
    expect(ddl).toContain("SECURITY DEFINER");
    expect(ddl).toContain("can_v30_canonical_auth_reader");
  });

});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { projectCanonicalPrincipalContext } from "@/domain/canonical-access";
import {
  canResolveCanSiteStaff, hasUnambiguousCanPerson,
  selectExactCanonicalStaffGrant,
} from "@/domain/canonical-can-sso";

function source(path:string) {
  return readFileSync(resolve(path), "utf8");
}

const staff = {
  role: "site_admin",
  accountId: "can-account",
  actorPersonId: "can-person",
  grantSiteId: "school-site",
  scope: {
    organizationIds: ["school-org"], siteIds: ["school-site"],
  },
  capabilities: new Set(["enrollment:manage"]),
};

describe("one CAN login for authorized canonical Site staff", () => {
  it("accepts scoped CAN Site Admin and Registrar, without a second credential", () => {
    expect(canResolveCanSiteStaff(staff)).toBe(true);
    expect(canResolveCanSiteStaff({ ...staff, role: "registrar" })).toBe(true);
    expect(canResolveCanSiteStaff({
      ...staff, capabilities: new Set<string>(),
    })).toBe(true);
  });

  it("never converts cross-Person demo switching into canonical authority", () => {
    expect(canResolveCanSiteStaff({
      ...staff, sessionAccountId: "different-session-owner",
    })).toBe(false);
    for (const denied of [
      { ...staff, role: "guardian" },
      { ...staff, role: "student" },
      { ...staff, grantSiteId: null },
      { ...staff, actorPersonId: null },
      { ...staff, scope: { organizationIds: [], siteIds: ["school-site"] } },
      { ...staff, scope: { organizationIds: ["school-org"], siteIds: ["other-site"] } },
      { ...staff, scope: { organizationIds: ["school-org","other-org"], siteIds: ["school-site"] } },
      { ...staff, sessionAccountId: staff.accountId },
    ]) {
      expect(canResolveCanSiteStaff(denied)).toBe(false);
    }
  });

  it("requires the same unique public Person across active account grants", () => {
    expect(hasUnambiguousCanPerson("me", ["me","me"])).toBe(true);
    expect(hasUnambiguousCanPerson("me", [])).toBe(false);
    expect(hasUnambiguousCanPerson("me", ["me","other"])).toBe(false);
    expect(hasUnambiguousCanPerson("me", Array(101).fill("me"))).toBe(false);
  });

  it("requires one exact verified canonical role, Person and Site", () => {
    const grant = {
      grantId: "grant", personId: "native-person",
      roleCode: "site_admin", organizationId: "native-org",
      siteId: "native-site",
    };
    const expected = {
      personId: "native-person", roleCode: "site_admin" as const,
      siteId: "native-site",
    };
    expect(selectExactCanonicalStaffGrant([grant], expected)).toEqual(grant);
    expect(selectExactCanonicalStaffGrant([], expected)).toBeNull();
    expect(selectExactCanonicalStaffGrant([grant, grant], expected)).toBeNull();
    expect(selectExactCanonicalStaffGrant([{
      ...grant, roleCode: "registrar",
    }], expected)).toBeNull();
    expect(selectExactCanonicalStaffGrant([{
      ...grant, siteId: "other-site",
    }], expected)).toBeNull();
    expect(selectExactCanonicalStaffGrant([{
      ...grant, personId: "other-person",
    }], expected)).toBeNull();
  });

  it("shares exact canonical role capabilities without granting reviewers or learner data", () => {
    const projected = projectCanonicalPrincipalContext({
      person_id: "native-person",
      role_code: "site_admin",
      organization_id: "native-org",
      site_id: "native-site",
    });
    expect(projected.scope).toEqual({
      organizationIds: ["native-org"], siteIds: ["native-site"],
    });
    expect(projected.actorPersonId).toBe("native-person");
    expect(projected.capabilities.has("noncredit.assessment.provision")).toBe(true);
    expect(projected.capabilities.has("noncredit.enrollment.read")).toBe(true);
    expect(projected.capabilities.has("noncredit.enrollment.manage")).toBe(true);
    expect(projected.capabilities.has("credential.preview")).toBe(true);
    expect(projected.capabilities.has("credential.issue")).toBe(false);
    expect(projected.capabilities.has("learning.participate")).toBe(false);
    expect(projected.capabilities.has("blueprint.review")).toBe(false);
  });

  it("uses CAN sessions before native sessions for school staff and fails closed", () => {
    const auth = source("src/modules/identity/canonical-command-context.server.ts");
    const bridge = source("src/modules/identity/canonical-can-staff-bridge.server.ts");
    expect(auth).toContain("accessSessionCookie");
    expect(auth).toContain("getCommandContext(request)");
    expect(auth).toContain("resolveCanonicalSiteStaffFromCan(actor, request)");
    expect(auth.indexOf("getCommandContext(request)"))
      .toBeLessThan(auth.lastIndexOf("getCanonicalSessionRow(request)"));
    const restricted = source(
      "database/canonical/v3.0.1/patch-can-staff-restricted-auth-reader.sql",
    );
    expect(bridge).toContain("CAN_CANONICAL_AUTH_DATABASE_URL");
    expect(bridge).toContain("SET LOCAL ROLE");
    expect(bridge).toContain("v301_can_staff_session_context($1::text)");
    expect(bridge).not.toContain('from(accessAccountCanonicalPrincipals)');
    expect(bridge).not.toContain('from(canonicalAccountGrants)');
    expect(restricted).toContain("public.access_account_canonical_principals");
    expect(restricted).toContain("public.site_canonical_identity_links");
    expect(restricted).toContain("site_link.status = 'approved'");
    expect(restricted).toContain("site_link.confirmed_at IS NOT NULL");
    expect(restricted).toContain("native_grant.revoked_at IS NULL");
    expect(restricted).toContain("native_account.disabled_at IS NULL");
    expect(restricted).toContain("operator_role.valid_through");
    expect(restricted).toContain("SECURITY DEFINER");
    expect(restricted).toContain("REVOKE ALL ON FUNCTION");
    expect(bridge).not.toContain("email === canonical");
    expect(bridge).not.toContain("issueNativeLearnerSession");
    expect(bridge).not.toContain("insert(canonicalAccountGrants)");
  });

  it("only an independent institutional reviewer can link or revoke principals", () => {
    const ops = source("src/modules/sites/site-identity-links.functions.ts");
    const ui = source("src/routes/site-identity.tsx");
    const patch = source("database/canonical/v3.0.1/patch-can-staff-single-login.sql");
    expect(ops).toContain("verifyCANStaffCanonicalPrincipal");
    expect(ops).toContain("revokeCANStaffCanonicalPrincipal");
    expect(ops).toContain("await requireCANReviewer()");
    expect(ops).toContain("reviewer.accountId === data.publicAccountId");
    expect(ops).toContain("identity.canonical_staff.verified");
    expect(ops).toContain("identity.canonical_staff.revoked");
    expect(ui).toContain('mode==="staff"');
    expect(ui).toContain("I independently verified");
    expect(patch).toContain("access_account_canonical_principals_active_person_uq");
    expect(patch).toContain("FORCE ROW LEVEL SECURITY");
    expect(patch).toContain("REFERENCES education_v30.persons(id)");
  });
});

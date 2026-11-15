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
      ...staff, sessionAccountId: staff.accountId,
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
      { ...staff, capabilities: new Set<string>() },
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
    expect(projected.capabilities.has("learning.participate")).toBe(false);
    expect(projected.capabilities.has("blueprint.review")).toBe(false);
  });

  it("uses CAN sessions before native sessions for school staff and fails closed", () => {
    const auth = source("src/modules/identity/canonical-command-context.server.ts");
    const bridge = source("src/modules/identity/canonical-can-staff-bridge.server.ts");
    expect(auth).toContain("accessSessionCookie");
    expect(auth).toContain("getCommandContext(request)");
    expect(auth).toContain("resolveCanonicalSiteStaffFromCan(actor)");
    expect(auth.indexOf("getCommandContext(request)"))
      .toBeLessThan(auth.lastIndexOf("getCanonicalSessionRow(request)"));
    expect(bridge).toContain("accessAccountCanonicalPrincipals");
    expect(bridge).toContain("site_canonical_identity_links");
    expect(bridge).toContain("status = 'approved'");
    expect(bridge).toContain('confirmed_at IS NOT NULL AND reviewed_at IS NOT NULL');
    expect(bridge).toContain("canonicalAccountGrants.revokedAt");
    expect(bridge).toContain("canonicalAccounts.disabledAt");
    expect(bridge).toContain("siteOrganizationRoles.validThrough");
    expect(bridge).toContain("unique canonical Person ownership");
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

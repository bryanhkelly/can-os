import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { projectCanonicalPrincipalContext } from "@/domain/canonical-access";
import {
  canResolveCanSiteStaff,
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
    expect(canResolveCanSiteStaff({ ...staff, role: "room_facilitator" })).toBe(true);
    expect(canResolveCanSiteStaff({
      ...staff, capabilities: new Set<string>(),
    })).toBe(true);
  });

  it("uses one verified CAN login for the room facilitator without escalating privilege", () => {
    const role = "room_facilitator";
    const projected = projectCanonicalPrincipalContext({
      person_id: "room-person", role_code: role,
      organization_id: "site-operator", site_id: "site-a",
    });
    expect(projected.capabilities.has("learning.room.facilitate")).toBe(true);
    for (const denied of [
      "class.manage", "credential.issue", "noncredit.enrollment.manage",
      "blueprint.review", "noncredit.completion.decide",
    ]) expect(projected.capabilities.has(denied)).toBe(false);
    for (const invalid of [
      { ...staff, role, sessionAccountId: "shared-login-delegate" },
      { ...staff, role, grantSiteId: null },
      { ...staff, role, actorPersonId: null },
      { ...staff, role: "site_staff" },
    ]) expect(canResolveCanSiteStaff(invalid)).toBe(false);

    const auth = source("src/modules/identity/canonical-command-context.server.ts");
    const eligibility = source("src/domain/canonical-can-sso.ts");
    const restricted = source("database/production/2026-11-17-room-facilitator-one-login.sql");
    expect(auth).toContain('actor.role === "room_facilitator"');
    expect(eligibility).toContain('actor.role === "room_facilitator"');
    expect(restricted).toContain("g.role IN ('site_admin', 'registrar', 'room_facilitator')");
    expect(restricted).toContain("a.email_verified_at IS NOT NULL");
    expect(restricted).toContain("a.person_id = g.person_id");
    expect(restricted).toContain("other_grant.person_id <> g.person_id");
    expect(restricted).toContain("SET search_path TO 'pg_catalog', 'pg_temp'");
    expect(restricted).not.toContain("INSERT INTO public.account_person_grants");
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

  it("does not depend on duplicate staff Persons, accounts or canonical grants",()=>{
    const restricted=source("database/production/2026-11-17-single-can-staff-projection.sql");
    expect(restricted).toContain("source.can_grant_id");
    expect(restricted).toContain("a.person_id = g.person_id");
    expect(restricted).toContain("school_site.organization_id = g.organization_id");
    expect(restricted).toContain("g.role IN ('site_admin', 'registrar')");
    expect(restricted).toContain("other_grant.person_id <> g.person_id");
    expect(restricted).not.toContain("access_account_canonical_principals");
    expect(restricted).not.toContain("canonical_account_grants");
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

  it("uses the current CAN session and exact restricted grant for school staff",()=>{
    const auth=source("src/modules/identity/canonical-command-context.server.ts");
    const staff=source("src/modules/identity/can-site-staff-authority.server.ts");
    const reader=source("src/modules/identity/restricted-canonical-session-reader.server.ts");
    const sql=source("database/production/2026-11-17-single-can-staff-projection.sql");
    expect(auth).toContain("getIdentityContext(request)");
    expect(auth).toContain("resolveCanonicalSiteStaffFromCan(actor, request)");
    expect(auth.indexOf("getIdentityContext(request)"))
      .toBeLessThan(auth.lastIndexOf("getCanonicalSessionRow(request)"));
    expect(staff).toContain('readRestrictedCanonicalSession("can_staff", digest)');
    expect(staff).toContain("native.account_id !== actor.accountId");
    expect(staff).toContain("native.session_id !== actor.sessionId");
    expect(staff).toContain("native.grant_id !== actor.grantId");
    expect(staff).toContain("native.person_id !== actor.actorPersonId");
    expect(staff).toContain("native.organization_id !== actor.scope.organizationIds?.[0]");
    expect(staff).toContain("native.site_id !== actor.grantSiteId");
    expect(reader).toContain("CAN_CANONICAL_AUTH_DATABASE_URL");
    expect(reader).toContain("SET LOCAL ROLE");
    expect(reader).toContain("BEGIN READ ONLY");
    expect(reader).toContain("v301_can_staff_session_context($1::text)");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("can_v30_canonical_auth_reader");
    expect(sql).toContain("a.person_id = g.person_id");
    expect(sql).not.toContain("canonical_account_grants");
    expect(sql).not.toContain("access_account_canonical_principals");
    expect(staff).not.toContain("issueNativeLearnerSession");
  });

  it("aligns main-only staff readiness with the same public Person/Site role",()=>{
    const readiness=source("scripts/acceptance/check-canonical-staff-readiness.mjs");
    const restricted=source("database/production/2026-11-17-single-can-staff-projection.sql");
    for(const guard of [
      "public.account_person_grants",
      "person.active = true",
      "school_site.lifecycle_status",
      "owning_org.lifecycle_status",
      "other_grant.person_id",
    ])expect(restricted,guard).toContain(guard);
    for(const guard of [
      "public.account_person_grants",
      "public.access_sessions",
      "site.lifecycle_status",
      "org.lifecycle_status",
      "public_grant.active",
      "conflicting.person_id",
    ])expect(readiness,guard).toContain(guard);
    expect(readiness).toContain("BEGIN READ ONLY");
    expect(readiness).toContain("eligible_staff_paths");
    expect(readiness).toContain("acceptance_ready: ready");
    expect(readiness).toContain("eligible_app_admin_grants");
    expect(readiness).toContain("eligible_institutional_approver_grants");
    expect(readiness).toContain("first_admin_provisioning_blocked");
    expect(readiness).toContain("authorized.account_id = a.id");
    expect(readiness).toContain("authorized.person_id = a.person_id");
    expect(readiness).toContain("authorized.active = true");
    expect(readiness).toContain("authority_org.type = 'can_network'");
    expect(readiness).toContain("An initial institutional reviewer needs a separately governed, audited appointment.");
    expect(readiness).not.toContain("INSERT INTO");
    expect(readiness).not.toContain("UPDATE public.");
    const provision=source("scripts/provision-platform-admin.mjs");
    expect(provision).toContain("Number(authority.rows[0]?.count) !== 1");
    expect(provision).toContain("person_id <> $2");
    expect(provision).toContain("approverConflicts");
    expect(provision).toContain("Independent approver has conflicting active Person grants");
    expect(provision).toContain('PRODUCTION_PROJECT_ID = "sweet-hall-62441909"');
    expect(provision).toContain('PRODUCTION_BRANCH_ID = "br-restless-sea-ar9ooo55"');
  });

  it("never allows dual-cookie learning persistence to bypass CAN Person verification", () => {
    const sourceCode = source("src/modules/identity/learning-command-context.server.ts");
    expect(sourceCode).toContain("accessSessionCookie");
    expect(sourceCode).toContain("const context = await getCanonicalCommandContext(request)");
    expect(sourceCode).toContain("context.actorPersonId !== row.person_id");
    expect(sourceCode).toContain("one verified learning Person");
  });

  it("retired native staff Person creation cannot issue new correspondence", () => {
    const ops = source("src/modules/sites/staff-principal-verification.functions.ts");
    const ui = source("src/routes/site-identity.tsx");
    expect(ops).toContain("verifyCANStaffCanonicalPrincipal");
    expect(ops).toContain("retired native Person correspondence");
    expect(ops).not.toContain("tx.insert(accessAccountCanonicalPrincipals)");
    expect(ops).toContain("revokeCANStaffCanonicalPrincipal");
    expect(ops).toContain("await requireCANReviewer()");
    expect(ops).toContain("identity.canonical_staff.revoked");
    expect(ui).toContain("Staff Person correspondence retired");
    expect(ui).not.toContain("verifyCANStaffCanonicalPrincipal");
    expect(ui).not.toContain("canonicalPersonId");
    expect(ui).toContain('href="/admin"');

  });
});

import { describe, expect, it } from "vitest";
import { resolveAccessContext, assertGrantSelection, type VerifiedAccessGrant } from "@/domain/access-context";
import {
  assertOnsiteSafeguardingSubmissionScope, assertSafeguardingStaffInviteSite,
  isOnsiteSafeguardingRole, onsiteSafeguardingRoles,
} from "@/domain/site-safeguarding-access";

const site = "site-a";
const base: VerifiedAccessGrant = {
  id: "grant-1", accountId: "account-1", personId: "person-1",
  organizationId: "org-1", siteId: site, role: "room_facilitator", active: true,
};

describe("site safeguarding report-only authorization", () => {
  it.each(onsiteSafeguardingRoles)("%s has safeguarded reporting without full incident access", role => {
    const ctx = resolveAccessContext({
      accountId: base.accountId, sessionId: "login-1", activeGrantId: base.id,
    }, [{ ...base, role }]);
    expect(ctx.role).toBe(role);
    expect(ctx.grantSiteId).toBe(site);
    expect(ctx.capabilities.has("safeguarding.concern.submit")).toBe(true);
    expect(ctx.capabilities.has("onsite.attendance.record")).toBe(role !== "paraeducator");
    expect(() => assertOnsiteSafeguardingSubmissionScope(ctx, site)).not.toThrow();
    for (const capability of [
      "incident.file", "incident.read", "incident.amend", "incident.close",
      "incident.review.assign", "incident.notify", "referrals:manage",
      "support-plans:manage", "assignments:grade", "attendance.write",
      "student:read", "admin.manage", "action.resolve", "enrollment.activate",
    ]) expect(ctx.capabilities.has(capability)).toBe(false);
  });

  it("requires a selected site for any reporter-only membership invitation", () => {
    for (const role of onsiteSafeguardingRoles) {
      expect(isOnsiteSafeguardingRole(role)).toBe(true);
      expect(() => assertSafeguardingStaffInviteSite(role, undefined)).toThrow("explicit site");
      expect(() => assertSafeguardingStaffInviteSite(role, null)).toThrow("explicit site");
      expect(() => assertSafeguardingStaffInviteSite(role, site)).not.toThrow();
    }
    expect(() => assertSafeguardingStaffInviteSite("teacher", null)).not.toThrow();
  });

  it("rejects sister sites and organization-wide grants for an onsite reporter", () => {
    const ctx = resolveAccessContext({
      accountId: base.accountId, sessionId: "login-1", activeGrantId: base.id,
    }, [base]);
    expect(() => assertOnsiteSafeguardingSubmissionScope(ctx, "site-b")).toThrow();
    // Expanded read scope must never override the ORIGINAL grant's site.
    ctx.scope.siteIds = ["site-a", "site-b"];
    expect(() => assertOnsiteSafeguardingSubmissionScope(ctx, "site-b")).toThrow();
    const global = resolveAccessContext({
      accountId: base.accountId, sessionId: "login-2", activeGrantId: base.id,
    }, [{ ...base, siteId: null }]);
    global.scope.siteIds = [site];
    expect(() => assertOnsiteSafeguardingSubmissionScope(global, site)).toThrow();
  });

  it("does not allow inactive grants, wrong accounts or unsupported roles to activate", () => {
    expect(() => assertGrantSelection("account-1", base.id, [{ ...base, active:false }])).toThrow();
    expect(() => assertGrantSelection("other-account", base.id, [base])).toThrow();
    expect(() => resolveAccessContext({
      accountId: "other-account", sessionId: "login", activeGrantId: base.id,
    }, [base])).toThrow();
    const teacher = resolveAccessContext({
      accountId: base.accountId, sessionId: "login", activeGrantId: base.id,
    }, [{...base,role:"teacher"}]);
    expect(() => assertOnsiteSafeguardingSubmissionScope(teacher, site)).toThrow();
  });
});

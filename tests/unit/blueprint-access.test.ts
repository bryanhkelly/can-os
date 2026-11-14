import { describe, expect, it } from "vitest";
import { resolveAccessContext, type VerifiedAccessGrant } from "@/domain/access-context";

const orgId = "00000000-0000-4000-8000-000000000001";
const siteId = "00000000-0000-4000-8000-000000000002";

function scopeFor(role: string, grantSiteId: string | null): VerifiedAccessGrant {
  return {
    id: "grant",
    accountId: "account",
    personId: "00000000-0000-4000-8000-000000000003",
    role,
    organizationId: orgId,
    siteId: grantSiteId,
    active: true,
  };
}

const principal = { accountId: "account", sessionId: "session", activeGrantId: "grant" };

describe("canonical Blueprint capability separation", () => {
  it("lets a verified Site administrator prepare and execute independently reviewed Blueprints", () => {
    const siteAdmin = resolveAccessContext(principal, [scopeFor("site_admin", siteId)]);
    expect(siteAdmin.capabilities.has("blueprint.read")).toBe(true);
    expect(siteAdmin.capabilities.has("blueprint.configure")).toBe(true);
    expect(siteAdmin.capabilities.has("blueprint.execute")).toBe(true);
    expect(siteAdmin.capabilities.has("blueprint.review")).toBe(false);
    expect(siteAdmin.scope.siteIds).toEqual([siteId]);
  });

  it("keeps the independent reviewer separate from operational and authoring permission", () => {
    const reviewer = resolveAccessContext(principal, [scopeFor("blueprint_reviewer", null)]);
    expect(reviewer.capabilities.has("blueprint.review")).toBe(true);
    expect(reviewer.capabilities.has("blueprint.read")).toBe(true);
    expect(reviewer.capabilities.has("blueprint.configure")).toBe(false);
    expect(reviewer.capabilities.has("blueprint.execute")).toBe(false);
    expect(reviewer.capabilities.has("program.activate")).toBe(false);
    expect(reviewer.scope.organizationIds).toEqual([orgId]);
  });
});

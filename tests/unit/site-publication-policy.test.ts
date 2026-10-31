import { describe, expect, it } from "vitest";
import { roleCapabilities, type AccessContext } from "@/domain/access-context";
import { assertPartnerWebsitePreviewScope, assertSitePublicationScope, sitePublicationManageCapability, siteWebsiteDraftReadCapability, siteWebsiteLocalPublishCapability } from "@/domain/site-publication-policy";

const site = { id: "site-a", organizationId: "school-a" };
function actor(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    accountId: "account", sessionId: "session", grantId: "grant",
    grantSiteId: null, actorPersonId: "person", role: "registrar",
    capabilities: new Set([sitePublicationManageCapability]),
    scope: { organizationIds: ["school-a"], siteIds: ["site-a"] },
    ...overrides,
  };
}

describe("private site publication scope", () => {
  it("accepts a verified registrar with the site and organization", () => {
    expect(() => assertSitePublicationScope(actor(), site)).not.toThrow();
  });
  it("rejects foreign organizations and sibling sites", () => {
    expect(() => assertSitePublicationScope(actor(), { ...site, organizationId: "school-b" })).toThrow();
    expect(() => assertSitePublicationScope(actor(), { ...site, id: "site-b" })).toThrow();
  });
  it("does not treat missing or empty site scope as global access", () => {
    expect(() => assertSitePublicationScope(actor({ scope: { organizationIds: ["school-a"] } }), site)).toThrow();
    expect(() => assertSitePublicationScope(actor({ scope: { organizationIds: ["school-a"], siteIds: [] } }), site)).toThrow();
  });
  it("rejects another role, lost capability and missing person", () => {
    expect(() => assertSitePublicationScope(actor({ role: "network_admin" }), site)).toThrow();
    expect(() => assertSitePublicationScope(actor({ capabilities: new Set() }), site)).toThrow();
    expect(() => assertSitePublicationScope(actor({ actorPersonId: null }), site)).toThrow();
  });
});

describe("PUB-18 church website partner role boundary", () => {
  const partner = (overrides: Partial<AccessContext> = {}): AccessContext =>
    actor({
      role: "site_website_editor",
      grantSiteId: site.id,
      capabilities: new Set([siteWebsiteDraftReadCapability]),
      ...overrides,
    });

  it("allows a verified Site-specific partner but not publisher mutation capability", () => {
    expect(() => assertPartnerWebsitePreviewScope(partner(), site)).not.toThrow();
    expect(() => assertSitePublicationScope(partner(), site)).toThrow();
    expect(roleCapabilities.site_website_editor).toEqual([siteWebsiteDraftReadCapability, siteWebsiteLocalPublishCapability]);
    for (const denied of [
      "site.publication.manage", "enrollment.decide", "admissions:read",
      "program.launch.start", "student:read", "action.resolve",
    ]) expect(roleCapabilities.site_website_editor).not.toContain(denied);
  });
  it("rejects broader registrar, institutional publisher and unrelated Site grants", () => {
    expect(() => assertPartnerWebsitePreviewScope(actor(), site)).toThrow();
    expect(() => assertPartnerWebsitePreviewScope(partner({ grantSiteId: null }), site)).toThrow();
    expect(() => assertPartnerWebsitePreviewScope(partner({ grantSiteId: "site-b" }), site)).toThrow();
    expect(() => assertPartnerWebsitePreviewScope(partner(), { ...site, id: "site-b" })).toThrow();
    expect(() => assertPartnerWebsitePreviewScope(partner(), { ...site, organizationId: "school-b" })).toThrow();
  });
  it("rejects missing person, capability, Site scope or Organization scope", () => {
    expect(() => assertPartnerWebsitePreviewScope(partner({ actorPersonId: null }), site)).toThrow();
    expect(() => assertPartnerWebsitePreviewScope(partner({ capabilities: new Set() }), site)).toThrow();
    expect(() => assertPartnerWebsitePreviewScope(partner({
      scope: { organizationIds: ["school-a"], siteIds: ["site-b"] },
    }), site)).toThrow();
    expect(() => assertPartnerWebsitePreviewScope(partner({
      scope: { organizationIds: ["school-b"], siteIds: ["site-a"] },
    }), site)).toThrow();
  });
});

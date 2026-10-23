import { describe, expect, it } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import { assertSitePublicationScope, sitePublicationManageCapability } from "@/domain/site-publication-policy";

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

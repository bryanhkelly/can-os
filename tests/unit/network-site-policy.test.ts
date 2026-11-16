import { describe, expect, it } from "vitest";
import { resolveAccessContext } from "@/domain/access-context";
import { assertNetworkSiteAccess, assertIanaTimezone, assertLocalSiteAffiliationScope } from "@/domain/network-site-policy";

const grant = { id: "grant", accountId: "account", personId: "person", role: "network_admin",
  organizationId: "denom", siteId: null, active: true };

function actor(overrides: Partial<typeof grant> = {}) {
  return resolveAccessContext({ accountId: "account", sessionId: "session", activeGrantId: "grant" },
    [{ ...grant, ...overrides }]);
}
const denomination = { id: "denom", type: "denomination" };

describe("denomination HQ site authority", () => {
  it("allows verified organization-wide HQ administration", () => {
    expect(() => assertNetworkSiteAccess(actor(), denomination, "network.sites.manage")).not.toThrow();
    expect(() => assertNetworkSiteAccess(actor(), denomination, "network.sites.read")).not.toThrow();
  });
  it("never turns a school registrar into a network officer", () => {
    expect(() => assertNetworkSiteAccess(actor({ role: "registrar" }), denomination, "network.sites.manage")).toThrow();
  });
  it("denies site-scoped HQ grants even with a denomination membership", () => {
    expect(() => assertNetworkSiteAccess(actor({ siteId: "campus" }), denomination, "network.sites.manage")).toThrow();
  });
  it("denies a different organization or a non-denomination HQ", () => {
    expect(() => assertNetworkSiteAccess(actor(), { id: "different", type: "denomination" }, "network.sites.manage")).toThrow();
    expect(() => assertNetworkSiteAccess(actor(), { id: "denom", type: "christian_school" }, "network.sites.manage")).toThrow();
  });
  it("separates local requests from HQ review authority", () => {
    const hq = actor();
    const school = actor({ role: "registrar" });
    expect(hq.capabilities.has("network.affiliations.review")).toBe(true);
    expect(hq.capabilities.has("network.affiliations.request")).toBe(false);
    expect(school.capabilities.has("network.affiliations.request")).toBe(true);
    expect(school.capabilities.has("network.affiliations.review")).toBe(false);
    expect(() => assertNetworkSiteAccess(hq, denomination, "network.affiliations.review")).not.toThrow();
    expect(() => assertNetworkSiteAccess(school, denomination, "network.affiliations.review")).toThrow();
  });
  it("never grants academic access, admissions or student enrollment capabilities", () => {
    const permissions = actor().capabilities;
    expect([...permissions].sort()).toEqual(["network.affiliations.read", "network.affiliations.review", "network.sites.manage", "network.sites.read"]);
  });
  it("requires a real timezone", () => {
    expect(() => assertIanaTimezone("America/Los_Angeles")).not.toThrow();
    expect(() => assertIanaTimezone("Mars/Colony")).toThrow("IANA timezone");
  });
});

// Local Site launch must also work from a verified organization-wide registrar
// account, without granting a cross-organization or sibling-Site shortcut.
describe("Site launch affiliation boundaries",()=>{
  const local=(siteId:string|null, organizationId="local") =>
    resolveAccessContext({accountId:"account",sessionId:"session",activeGrantId:"grant"},[
      {id:"grant",accountId:"account",personId:"person",role:"registrar",organizationId,siteId,active:true},
    ]);
  const site={id:"campus",organizationId:"local",organizationType:"church"};
  it("allows verified organization-wide operators to request for their own Site",()=>{
    expect(()=>assertLocalSiteAffiliationScope(local(null),site)).not.toThrow();
  });
  it("allows exact Site registrars but no sibling Site",()=>{
    expect(()=>assertLocalSiteAffiliationScope(local("campus"),site)).not.toThrow();
    expect(()=>assertLocalSiteAffiliationScope(local("other-campus"),site)).toThrow();
  });
  it("refuses another organization and a denomination HQ Site",()=>{
    expect(()=>assertLocalSiteAffiliationScope(local(null,"another"),site)).toThrow();
    expect(()=>assertLocalSiteAffiliationScope(local(null),{...site,organizationType:"denomination"})).toThrow();
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scopedSiteRouteAccess } from "@/domain/site-route-access";
import { resolveAccessContext } from "@/domain/access-context";

const source = (path: string) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

describe("current Site slug route authorization", () => {
  const org = "11111111-1111-4111-8111-111111111111";
  const site = "22222222-2222-4222-8222-222222222222";
  const sibling = "33333333-3333-4333-8333-333333333333";
  const principal = { accountId: "account", sessionId: "session", activeGrantId: "grant" };
  const grant = (siteId: string | null, role = "site_admin") => ({
    id: "grant", accountId: "account", personId: "person", role,
    organizationId: org, siteId, active: true,
  });

  it("restricts a Site grant to its verified Site, even within the same Organization", () => {
    const context = resolveAccessContext(principal, [grant(site)]);
    const scope = scopedSiteRouteAccess({ ...context, scope: {
      organizationIds: [org], siteIds: [site, sibling],
    } });
    expect(scope).toEqual({ organizationIds: [org], siteIds: [site] });
  });

  it("does not widen a missing or empty Site scope or unauthenticated lookup", () => {
    const context = resolveAccessContext(principal, [grant(null)]);
    expect(scopedSiteRouteAccess(context)).toBeNull();
    expect(scopedSiteRouteAccess({ ...context, scope: {
      organizationIds: [org], siteIds: [],
    } })).toBeNull();
    expect(scopedSiteRouteAccess({ ...context, actorPersonId: null, scope: {
      organizationIds: [org], siteIds: [site],
    } })).toBeNull();
  });

  it("accepts only previously expanded Organization-level Site membership", () => {
    const context = resolveAccessContext(principal, [grant(null, "network_admin")]);
    expect(scopedSiteRouteAccess({ ...context, scope: {
      organizationIds: [org], siteIds: [site, sibling],
    } })).toEqual({ organizationIds: [org], siteIds: [site, sibling] });
  });

  it("has no alias-table dependency, stays private and uses current slugs only", () => {
    const resolver = source("src/modules/sites/site-route-resolver.functions.ts");
    expect(resolver).toContain("innerJoin(organizations");
    expect(resolver).toContain("inArray(sites.id, scope.siteIds)");
    expect(resolver).not.toContain("siteRouteAliases");
    const auth = source("src/domain/auth-route-policy.ts");
    expect(auth).not.toContain('path.startsWith("/o/")');
    const journal = JSON.parse(source("drizzle/meta/_journal.json")) as { entries: { tag: string }[] };
    expect(journal.entries.at(-1)?.tag).toBe("0106_site_go_links_private_role_access");
    expect(source("drizzle/0106_site_go_links_private_role_access.sql")).toContain("ENABLE ROW LEVEL SECURITY");
    expect(source("drizzle/0106_site_go_links_private_role_access.sql")).toContain("anonymous, authenticated");
  });
});

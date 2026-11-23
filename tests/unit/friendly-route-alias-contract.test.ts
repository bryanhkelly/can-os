import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Structural checks, not proof of applied SQL or database access. */
const source = (path: string) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

describe("governed friendly Site URL migration", () => {
  it("is ordered AFTER Go Links and never overwrites 0105", () => {
    const journal = JSON.parse(source("drizzle/meta/_journal.json")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const go = journal.entries.find(item => item.tag === "0105_site_go_links");
    const alias = journal.entries.find(item => item.tag === "0106_friendly_site_route_aliases");
    expect(go).toBeDefined();
    expect(alias).toBeDefined();
    expect(alias!.idx).toBe(go!.idx + 1);
    expect(journal.entries.at(-1)?.tag).toBe("0106_friendly_site_route_aliases");
  });

  it("reserves previous slugs, prevents reuse, and does not expose a public reader", () => {
    const sql = source("drizzle/0106_friendly_site_route_aliases.sql");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS \"site_route_aliases_address_uq\"");
    expect(sql).toContain("ON CONFLICT (\"organization_slug\",\"site_slug\")");
    expect(sql).toContain("CREATE TRIGGER \"sites_route_alias_sync\"");
    expect(sql).toContain("CREATE TRIGGER \"organizations_route_alias_sync\"");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain('"site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE');
    expect(sql).toContain("REVOKE ALL ON TABLE \"site_route_aliases\" FROM PUBLIC");
    expect(sql).not.toContain("DROP TABLE");
    expect(sql).not.toContain("TRUNCATE TABLE");
    expect(sql).toContain("--> statement-breakpoint");
    expect(source("src/modules/sites/site-publication.server.ts")).toContain("historicalConflict");
  });

  it("resolver enforces Organization and Site authorization before selecting an alias", () => {
    const reader = source("src/modules/sites/site-route-resolver.functions.ts");
    expect(reader).toContain("actor.scope.organizationIds");
    expect(reader).toContain("actor.grantSiteId");
    expect(reader).toContain("actor.scope.siteIds.length === 0");
    expect(reader).toContain("siteRouteAliases.organizationSlug");
    expect(reader).toContain("siteRouteAliases.siteSlug");
    expect(reader).toContain("siteRouteAliases.organizationId");
    expect(reader).toContain("actor.scope.siteIds && actor.scope.siteIds.length === 0");
    expect(reader).toContain("inArray(sites.id, actor.scope.siteIds)");
  });

  it("does not convert a private Site lookup into public or unauthenticated navigation", () => {
    const auth = source("src/domain/auth-route-policy.ts");
    expect(auth).not.toContain('"/o"');
    expect(auth).not.toContain('path.startsWith("/o/")');
    const routes = source("src/components/shell/route-navigation.ts");
    expect(routes).toContain('"/o/$organizationSlug/$siteSlug/launch"');
    expect(routes).toContain('"/o/$organizationSlug/$siteSlug/website"');
  });
});

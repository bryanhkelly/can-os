import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");

describe("Go Link Site reuse and scaled operations",()=>{
  it("allows a Site to own links without a marketing campaign",()=>{
    const schema=read("src/db/schema/site-go-links.ts");
    expect(schema).toMatch(/packageId:\s*uuid\("package_id"\)\.references/);
    expect(schema).not.toContain('packageId: uuid("package_id").notNull()');
    const migration=read("drizzle/0109_site_go_link_reuse.sql");
    expect(migration).toContain('ALTER COLUMN "package_id" DROP NOT NULL');
    expect(migration).toContain("site_go_links_request_uq");
    const resolver=read("src/modules/engagement/site-go-links.server.ts");
    expect(resolver).toContain("if(link.packageId)");
  });
  it("supports both friendly and UUID-routed Site operator pages",()=>{
    expect(read("src/routes/o.$organizationSlug.$siteSlug.go-links.tsx"))
      .toContain('resolveAuthorizedSiteRoute({data:params})');
    expect(read("src/routes/sites.$siteId.go-links.tsx"))
      .toContain("<GoLinkWorkspace siteId={siteId}/>");
    const sharing=read("src/components/launch-studio/SiteLinkSharing.tsx");
    expect(sharing).toContain('friendlySiteBase(identity)+"/go-links"');
  });
  it("uses bounded, stable keyset pages and scoped server search",()=>{
    const api=read("src/modules/engagement/site-go-links.functions.ts");
    expect(api).toContain("listSiteGoLinksPage");
    expect(api).toContain("eq(siteGoLinks.siteId,data.siteId)");
    expect(api).toContain("goLikeContainsLiteral(data.term)");
    expect(api).toContain("created_at,id FROM public.site_go_links");
    expect(api).toContain("data.limit+1");
    const ui=read("src/components/launch-studio/GoLinkWorkspace.tsx");
    expect(ui).toContain("Load more links");
    expect(ui).toContain("Search saved links by name");
    expect(ui).toContain("Search available destinations");
  });
  it("enforces exactly-once creation semantics for repeated request IDs",()=>{
    const schema=read("src/db/schema/site-go-links.ts");
    expect(schema).toContain("site_go_links_request_uq");
    const server=read("src/modules/engagement/site-go-links.functions.ts");
    const lifecycle=read("src/modules/engagement/go-link-lifecycle.server.ts");
    expect(lifecycle).toContain("pg_advisory_xact_lock");
    expect(lifecycle).toContain("prior.requestFingerprint!==fingerprint");
    expect(server).toContain("return toGoLinkView(prior)");
    const ui=read("src/components/launch-studio/GoLinkWorkspace.tsx");
    expect(ui).toContain("pendingSubmission.current");
    expect(ui).toContain("crypto.randomUUID()");
  });
  it("serves an unavailable page without disclosing a private link or Site",()=>{
    const page=read("src/routes/go.$code.ts");
    expect(page).toContain('Content-Security-Policy');
    expect(page).toContain('private, no-store');
    expect(page).toContain('href="/landing"');
    expect(page).not.toContain("params.code}</");
  });
});

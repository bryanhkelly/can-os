import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  siteCatalogReaderAccessible,type SiteNoncreditPreflight,
} from "@/domain/site-noncredit-catalog-readiness";

const complete:SiteNoncreditPreflight={
  sitesReady:true,releasesReady:true,publicSchema:true,nativeSchema:true,
  siteRead:true,releaseRead:true,
};
describe("single-Site noncredit catalog reader verification",()=>{
  it("checks shared Site and release reader permissions",()=>{
    expect(siteCatalogReaderAccessible(complete)).toBe(true);
    for(const key of Object.keys(complete) as (keyof SiteNoncreditPreflight)[])
      expect(siteCatalogReaderAccessible({...complete,[key]:false})).toBe(false);
  });
  it("filters by a shared, exact Site ID without a translation or link approval",()=>{
    const api=readFileSync(resolve(process.cwd(),
      "src/modules/sites/site-noncredit-releases.server.ts"),"utf8");
    expect(api).not.toContain("education_v30.sites");
    expect(api).toContain("platform_site.lifecycle_status='active'");
    expect(api).toContain("siteId:publicSiteId,limit:40");
    expect(api).toContain("readEligibleSelfEnrollmentReleases(executor");
    expect(api).toContain("probeSiteNoncreditCatalogReader(executor)");
    expect(api).toContain("reader_permission_missing");
    expect(api).not.toContain("site_canonical_identity_links");
    expect(api).not.toContain("mappingReady");
  });
  it("keeps the main catalog acceptance read-only and refuses other branches",()=>{
    const script=readFileSync(resolve(process.cwd(),
      "scripts/acceptance/check-site-noncredit-catalog.ts"),"utf8");
    expect(script).toContain("CAN_SITE_CATALOG_VALIDATION");
    expect(script).toContain("br-restless-sea-ar9ooo55");
    expect(script).toContain("readLinkedSiteNoncreditReleases(siteId)");
    expect(script).not.toContain("education_v30.sites");
    expect(script).not.toMatch(/sql`\s*(?:INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b/i);
  });
});

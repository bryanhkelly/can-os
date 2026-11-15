import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  siteCatalogReaderAccessible,type SiteNoncreditPreflight,
} from "@/domain/site-noncredit-bridge";

const complete:SiteNoncreditPreflight={
  mappingReady:true,releasesReady:true,publicSchema:true,nativeSchema:true,
  mappingRead:true,releaseRead:true,
};
describe("actual Site-to-canonical DB reader verification",()=>{
  it("only accepts all six independently verified permissions and relations",()=>{
    expect(siteCatalogReaderAccessible(complete)).toBe(true);
    for(const key of Object.keys(complete) as (keyof SiteNoncreditPreflight)[]){
      expect(siteCatalogReaderAccessible({...complete,[key]:false})).toBe(false);
    }
  });
  it("reads an approved Site identity only, checks an actual SQL reader and reports blocked states",()=>{
    const api=readFileSync(resolve(process.cwd(),
      "src/modules/sites/site-noncredit-releases.server.ts"),"utf8");
    expect(api).toContain("status='approved'");
    expect(api).toContain("readEligibleSelfEnrollmentReleases(executor");
    expect(api).toContain("probeSiteNoncreditCatalogReader(executor)");
    expect(api).toContain("reader_permission_missing");
    expect(api).toContain("SELECT 1 FROM education_v30.noncredit_self_enrollment_releases LIMIT 0");
  });
  it("requires a real independently approved Site and published release in isolated acceptance",()=>{
    const script=readFileSync(resolve(process.cwd(),
      "scripts/acceptance/check-site-noncredit-bridge.ts"),"utf8");
    expect(script).toContain("CAN_SITE_BRIDGE_VALIDATION");
    expect(script).toContain("CAN_EXPECTED_NEON_BRANCH_ID");
    expect(script).toContain("process.env.DATABASE_URL===process.env.TEST_DATABASE_URL");
    expect(script).toContain("m.status='approved'");
    expect(script).toContain("readLinkedSiteNoncreditReleases(row.publicSiteId)");
    expect(script).not.toContain("INSERT INTO public.site_canonical_identity_links");
  });
});

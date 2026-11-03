import {describe,expect,it} from "vitest";
import {publicSchoolDaySiteRevision} from "@/modules/academic-time/public-school-day-site-revision.server";

const site={
  address:{street1:"100 Maple Avenue",city:"Oakland",state:"CA",
    country:"US",postalCode:"94612",county:"Alameda"},
  metadata:{sitePhysicalAddressRevision:"2026-10-31T12:00:00Z",
    setupContact:{displayName:"School desk",phone:"555-1000"}},
};
describe("public academic schedule physical-Site revision",()=>{
  it("ignores unrelated contact edits, metadata field order and updatedAt churn",()=>{
    const original=publicSchoolDaySiteRevision(site);
    expect(publicSchoolDaySiteRevision({
      address:{...site.address},
      metadata:{sitePhysicalAddressRevision:site.metadata.sitePhysicalAddressRevision,
        setupContact:{phone:"555-2000",displayName:"Different desk"},
        siteContactRevision:"2026-11-03T18:00:00Z"},
    })).toBe(original);
    expect(original).not.toContain("Maple");
  });
  it("invalidates a new street, country, county or canonical S location revision",()=>{
    const original=publicSchoolDaySiteRevision(site);
    for(const changed of [
      {address:{...site.address,street1:"200 Maple Avenue"},metadata:site.metadata},
      {address:{...site.address,country:"CA"},metadata:site.metadata},
      {address:{...site.address,county:"Contra Costa"},metadata:site.metadata},
      {address:site.address,metadata:{
        ...site.metadata,sitePhysicalAddressRevision:"2026-11-03T18:00:00Z"}},
    ]) expect(publicSchoolDaySiteRevision(changed)).not.toBe(original);
  });
  it("does not invent a verified Site address revision for legacy records",()=>{
    expect(publicSchoolDaySiteRevision({address:site.address,metadata:{}}))
      .toContain("physical-site-v1:");
    expect(publicSchoolDaySiteRevision({address:null,metadata:{}}))
      .not.toBe(publicSchoolDaySiteRevision({address:site.address,metadata:{}}));
  });
});

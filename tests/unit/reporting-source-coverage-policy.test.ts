import { describe, expect, it } from "vitest";
import { summarizeReportingSourceCoverage } from "@/domain/reporting-source-coverage-policy";

describe("durable source completeness states",()=>{
  it("does not treat an empty source as zero actual outcomes",()=>{
    const result=summarizeReportingSourceCoverage([],0,0);
    expect(result.observedEvents).toBe(0);
    expect(result.sourceCoverage).toMatchObject({
      status:"no_source_evidence", lifecycleCompletenessVerified:false,
    });
  });
  it("excludes duplicates and legacy events from observed counts",()=>{
    const result=summarizeReportingSourceCoverage([
      {eventType:"SiteRoomCreated",status:"accepted",count:2},
      {eventType:"SiteRoomCreated",status:"duplicate",count:3},
      {eventType:"SiteRoomCreated",status:"legacy",count:1},
    ],1,0);
    expect(result.observedCounts).toEqual({SiteRoomCreated:2});
    expect(result.sourceCoverage).toMatchObject({
      status:"source_unreconciled",legacyEvents:1,duplicateEvents:3,unprojectedEvents:1,
    });
  });
  it("flags unresolved corrections instead of certifying a complete series",()=>{
    const r=summarizeReportingSourceCoverage([
      {eventType:"InterestEventCreated",status:"accepted",count:1},
    ],0,1);
    expect(r.sourceCoverage.status).toBe("source_unreconciled");
    expect(r.sourceCoverage.unresolvedCorrections).toBe(1);
  });
  it("distinguishes normalized receipts from verified lifecycle completeness",()=>{
    const r=summarizeReportingSourceCoverage([
      {eventType:"SiteMarketingPackageReleased",status:"accepted",count:2},
    ],0,0);
    expect(r.sourceCoverage).toMatchObject({
      status:"source_normalized",lifecycleCompletenessVerified:false,
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  REPORTING_DOMAIN_COVERAGE, assertReportingCoverageCatalogComplete,
} from "@/domain/reporting-instrumentation-coverage";

describe("platform-wide reporting instrumentation coverage",()=>{
  it("has an accountable owner for every governed reporting event",()=>{
    expect(()=>assertReportingCoverageCatalogComplete()).not.toThrow();
    expect(REPORTING_DOMAIN_COVERAGE.every(domain=>domain.owner.trim().length>0))
      .toBe(true);
  });
  it("never treats uninstrumented learning, Experiences or funding as zero",()=>{
    for(const domain of ["noncredit_learning","native_classes","experiences","partnerships_funding"]){
      const entry=REPORTING_DOMAIN_COVERAGE.find(row=>row.domain===domain);
      expect(entry?.instrumentedEvents).toEqual([]);
      expect(entry?.state).not.toBe("instrumented_subset");
      expect(entry?.missingLifecycleExamples.length).toBeGreaterThan(0);
    }
  });
  it("does not falsely certify full coverage for partially instrumented modules",()=>{
    expect(REPORTING_DOMAIN_COVERAGE.some(row=>row.state==="instrumented_subset")).toBe(true);
    expect(REPORTING_DOMAIN_COVERAGE.every(row=>row.state!=="not_connected" ||
      row.instrumentedEvents.length===0)).toBe(true);
  });
});

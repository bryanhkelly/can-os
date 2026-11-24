import {describe,it,expect} from "vitest";
import {REPORT_CATALOG,reportCatalogEntry,reportDefinitionId,reportCenterEntries} from "@/domain/report-catalog";
import {compareReportCounts} from "@/domain/report-period-comparison";
import {priorReportDateRange,resolveReportDateRange,utcDaysThroughToday} from "@/components/workspace/report-date-range";
describe("report catalog and period comparison",()=>{
  it("has unique stable definitions and does not expose network report execution",()=>{
    expect(new Set(REPORT_CATALOG.map(x=>x.id)).size).toBe(REPORT_CATALOG.length);
    expect(reportDefinitionId("provider-delivery")).toBe("provider-delivery-v1");
    expect(reportCatalogEntry("unknown")).toBeNull();
    expect(reportCatalogEntry("network-impact")?.placement).toBe("not_available");
    expect(reportCenterEntries.map(x=>x.id)).toEqual(["provider-delivery","noncredit-registration-outcomes"]);
  });
  it("uses equal non-overlapping UTC periods through leap day",()=>{
    const now=new Date("2024-03-04T12:00:00Z");
    const range={fromDay:"2024-03-01",untilDay:"2024-03-04"};
    const prior=priorReportDateRange(range,90,now);
    expect(prior).toEqual({fromDay:"2024-02-27",untilDay:"2024-03-01"});
    expect(resolveReportDateRange(prior!,90,now)?.to).toBe("2024-03-01T00:00:00.000Z");
    expect(priorReportDateRange({fromDay:"2024-02-30",untilDay:"2024-03-04"},90,now)).toBeNull();
  });
  it("allows today only in explicitly partial operational windows and never in equal-period comparison",()=>{
    const now=new Date("2026-11-24T09:00:00Z");
    const range=utcDaysThroughToday(30,now);
    expect(range.untilDay).toBe("2026-11-25");
    expect(resolveReportDateRange(range,366,now,true)?.to).toBe("2026-11-25T00:00:00.000Z");
    expect(resolveReportDateRange(range,366,now)).toBeNull();
    expect(priorReportDateRange(range,366,now)).toBeNull();
    expect(resolveReportDateRange({...range,untilDay:"2026-11-26"},366,now,true)).toBeNull();
  });
  it("preserves zero and refuses missing or invalid comparisons",()=>{
    expect(compareReportCounts(0,0)).toEqual({current:0,prior:0,change:0});
    expect(compareReportCounts(2,5)?.change).toBe(-3);
    expect(compareReportCounts(0,null)).toBeNull();
    expect(compareReportCounts(NaN,1)).toBeNull();
    expect(compareReportCounts(1,-1)).toBeNull();
  });
});

import { CAMPAIGN_METRIC_DEFINITIONS, CAMPAIGN_METRIC_VERSION } from "@/domain/campaign-metrics";
import {describe,it,expect} from "vitest";
import {validateReportChart,type ReportChartSpec} from "@/components/workspace/report-chart-data";
import {previousCompleteUtcDays,resolveReportDateRange} from "@/components/workspace/report-date-range";
import {bindRegisteredCounts,campaignReportDefinitions,pilotOutcomeDefinitions,goReportDefinitions} from "@/domain/reporting-view-definitions";
const common={title:"Fixture",description:"Synthetic",valueLabel:"Events",format:"count" as const,population:"One cohort"};
describe("governed report views",()=>{
  it("requires a complete reconciled distribution, never suppresses or imputes missing values",()=>{
    const spec={...common,kind:"distribution",total:10,points:[{id:"a",label:"A",value:7},{id:"b",label:"B",value:3}]} satisfies ReportChartSpec;
    expect(validateReportChart(spec)).toBe(true);
    expect(validateReportChart({...spec,total:11})).toBe(false);
    expect(validateReportChart({...spec,points:[{id:"a",label:"A",value:null}]})).toBe(false);
  });
  it("rejects nonnested funnel counts and unreconciled stacks",()=>{
    const points=[{id:"a",label:"A",value:10},{id:"b",label:"B",value:11}];
    expect(validateReportChart({...common,kind:"funnel",nestedCohort:true,points})).toBe(false);
    const spec={...common,kind:"stacked",series:[{id:"a",label:"A"},{id:"b",label:"B"}],rows:[{id:"x",label:"X",total:10,values:[6,4]}]} satisfies ReportChartSpec;
    expect(validateReportChart(spec)).toBe(true);
    expect(validateReportChart({...spec,rows:[{id:"x",label:"X",total:10,values:[6,5]}]})).toBe(false);
  });
  it("uses registered versioned metrics rather than local counting rules",()=>{
    const campaignDefinitions = campaignReportDefinitions();
    expect(campaignDefinitions.map(d => d.metricKey)).toEqual(
      CAMPAIGN_METRIC_DEFINITIONS.map(d => "campaign." + d.key),
    );
    expect(campaignDefinitions.every(d => d.definitionVersion === CAMPAIGN_METRIC_VERSION)).toBe(true);
    expect(campaignDefinitions.map(d => d.sourceMetricKey)).toEqual(
      CAMPAIGN_METRIC_DEFINITIONS.map(d => d.key),
    );
    expect(pilotOutcomeDefinitions().map(d=>d.metricKey)).toContain("noncredit.confirmedNoncreditCompletions");
    const definitions=goReportDefinitions();
    const values=bindRegisteredCounts(definitions,{linkOpens30d:0,pageViews30d:NaN,referralNoncreditRegistrations30d:null});
    expect(values.find(v=>v.id==="go.linkOpens30d")?.value).toBe(0);
    expect(values.find(v=>v.id==="go.pageViews30d")?.value).toBeNull();
    expect(values.find(v=>v.id==="go.referralNoncreditRegistrations30d")?.value).toBeNull();
  });
  it("validates exclusive UTC dates, calendar validity, duration and future boundaries",()=>{
    const now=new Date("2026-11-24T09:00:00Z");
    const range=previousCompleteUtcDays(30,now);
    expect(range).toEqual({fromDay:"2026-10-25",untilDay:"2026-11-24"});
    expect(resolveReportDateRange(range,90,now)?.to).toBe("2026-11-24T00:00:00.000Z");
    expect(resolveReportDateRange({fromDay:"2026-02-30",untilDay:"2026-03-03"},90,now)).toBeNull();
    expect(resolveReportDateRange({fromDay:"2026-10-25",untilDay:"2026-11-25"},90,now)).toBeNull();
    expect(resolveReportDateRange(range,29,now)).toBeNull();
  });
});

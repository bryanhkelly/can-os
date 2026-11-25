import { describe, expect, it } from "vitest";
import { formatReportChartValue, validateReportChart, type ReportChartSpec } from "@/components/workspace/report-chart-data";
const spec:ReportChartSpec={title:"Count",description:"Fixture only",valueLabel:"Registrations",kind:"comparison",format:"count",
  points:[{id:"zero",label:"Zero",value:0},{id:"missing",label:"Missing",value:null}]};
describe("report chart contract",()=>{
  it("distinguishes measured zero from unavailable",()=>{
    expect(validateReportChart(spec)).toBe(true);
    expect(formatReportChartValue(0)).toBe("0");
    expect(formatReportChartValue(null)).toBe("Unavailable");
  });
  it("rejects invalid or duplicate points and unbounded series",()=>{
    for(const value of [NaN,Infinity,-1,0.5])expect(validateReportChart({...spec,points:[{id:"x",label:"X",value}]})).toBe(false);
    expect(validateReportChart({...spec,points:[spec.points[0]!,spec.points[0]!]})).toBe(false);
    expect(validateReportChart({...spec,points:Array.from({length:61},(_,i)=>({id:String(i),label:String(i),value:i}))})).toBe(false);
  });
  it("formats percentages on an explicit 0 to 100 scale",()=>{
    expect(formatReportChartValue(42.25,"percent")).toBe("42.25%");
    expect(validateReportChart({...spec,format:"percent",points:[{id:"p",label:"P",value:101}]})).toBe(false);
  });
});

import {describe,it,expect} from "vitest";
import {formatReportValue,formatReportAxis,formatReportChange,reportValueComparison,reportTargetAttainment} from "@/domain/report-value-format";
import {validateReportChart,reportSeriesSlot,reportChartDomain,type ReportChartSpec} from "@/components/workspace/report-chart-data";
const base={title:"Fixture",description:"Synthetic",valueLabel:"Counts",population:"Disjoint population"} as const;
describe("governed analytical presentation",()=>{
 it("keeps explicit units, missing values and source amounts",()=>{
  expect(formatReportValue(1250.25,"usd")).toBe("$1,250.25");
  expect(formatReportValue(12.5,"hours")).toBe("12.5 h");
  expect(formatReportValue(30,"minutes")).toBe("30 min");
  expect(formatReportValue(1.5,"ratio")).toBe("1.5:1");
  expect(formatReportValue(0)).toBe("0");
  expect(formatReportValue(null)).toBe("Unavailable");
  expect(formatReportValue(NaN)).toBe("Unavailable");
  expect(formatReportValue(101,"percent")).toBe("Unavailable");
  expect(formatReportAxis(1250000,"usd")).toBe("$1.3M");
 });
 it("never invents a percentage change from zero or unavailable",()=>{
  expect(reportValueComparison(10,0)?.relativePercent).toBeNull();
  expect(reportValueComparison(null,1)).toBeNull();
  expect(reportValueComparison(15,10)?.relativePercent).toBe(50);
  expect(formatReportChange(-5,"percent")).toBe("−5 pp");
  expect(reportTargetAttainment(120,100)).toEqual({percent:120,visualValue:100});
  expect(reportTargetAttainment(0,0)).toBeNull();
 });
 it("reserves slots across filter and reorder, rejects unknown IDs",()=>{
  const spec={...base,kind:"distribution",seriesOrder:["a","b","c","d"],total:10,points:[{id:"d",label:"D",value:6},{id:"b",label:"B",value:4}]} satisfies ReportChartSpec;
  expect(validateReportChart(spec)).toBe(true);
  expect(reportSeriesSlot(spec,"d",0)).toBe(3);
  expect(reportSeriesSlot({...spec,points:[...spec.points].reverse()},"d",1)).toBe(3);
  expect(validateReportChart({...spec,seriesOrder:["a","b"]})).toBe(false);
  expect(validateReportChart({...spec,seriesOrder:["b","b","d"]})).toBe(false);
 });
 it("does not allow shared domains to clip marks or change percent scales",()=>{
  const spec={...base,kind:"comparison",points:[{id:"a",label:"A",value:50}],axisMax:100} satisfies ReportChartSpec;
  expect(validateReportChart(spec)).toBe(true);
  expect(reportChartDomain(spec)).toEqual([0,100]);
  expect(validateReportChart({...spec,axisMax:49})).toBe(false);
  expect(validateReportChart({...spec,format:"percent",axisMax:90})).toBe(false);
  expect(reportChartDomain({...spec,format:"percent",axisMax:undefined})).toEqual([0,100]);
 });
});

import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {contrastRatio} from "@/domain/color-contrast";
import {reportSeriesColors,reportSeriesPatterns,reportPlotStyle} from "@/components/workspace/report-chart-palette";
import {formatReportAxisValue,formatReportChartValue,reportChartLayout,truncateReportLabel,hasNonzeroReportChartValues,type ReportChartSpec} from "@/components/workspace/report-chart-data";
const css=readFileSync(new URL("../../src/styles.css",import.meta.url),"utf8");
function block(selector:string){
  const start=css.indexOf(selector+" {");
  if(start<0)throw Error("Theme block missing: "+selector);
  return css.slice(start,css.indexOf("}",start));
}
function token(source:string,name:string){
  const match=source.match(new RegExp("--"+name+":\\s*(#[0-9a-fA-F]{6});"));
  if(!match)throw Error("Missing literal token "+name);
  return match[1]!;
}
describe("V6.1 data visualization foundation",()=>{
  it("requires every categorical color to contrast against card, canvas and texture ink in both modes",()=>{
    for(const source of [block(":root"),block(".dark")]){
      const card=token(source,"card"),canvas=token(source,"background");
      for(const [alias,target] of [["axis","muted-foreground"],["grid","border"],["separator","card"],["hover","muted"]]){
        expect(source).toContain("--report-"+alias+": var(--"+target+");");
      }
      for(let i=1;i<=4;i++){
        const mark=token(source,"report-series-"+i);
        expect(contrastRatio(mark,card)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(mark,canvas)).toBeGreaterThanOrEqual(3);
      }
    }
    expect(new Set(reportSeriesPatterns).size).toBe(4);
    expect(reportSeriesColors).toEqual([1,2,3,4].map(i=>"var(--report-series-"+i+")"));
    expect(block('[data-can-brand="true"]')).not.toMatch(/--report-series-/);
    expect(block('.dark [data-can-brand="true"]')).not.toMatch(/--report-series-/);
  });
  it("owns responsive geometry and typography in the shared contract",()=>{
    expect(reportPlotStyle.axisFontFamily).toBe("var(--font-sans)");
    expect(reportPlotStyle.axisFontSize).toBeGreaterThanOrEqual(12);
    expect(reportChartLayout(240).categoryWidth).toBeLessThan(reportChartLayout(1200).categoryWidth);
    expect(reportChartLayout(240).tickCount).toBeLessThan(reportChartLayout(1200).tickCount);
    expect(reportChartLayout(0)).toEqual(reportChartLayout(320));
    expect(truncateReportLabel("A very long label",8)).toBe("A very …");
    expect(truncateReportLabel("短い",8)).toBe("短い");
  });
  it("abbreviates only the visual axis, not the exact-value table",()=>{
    expect(formatReportAxisValue(12500000)).toBe("12.5M");
    expect(formatReportChartValue(12500000)).toBe("12,500,000");
    expect(formatReportAxisValue(75,"percent")).toBe("75%");
    expect(formatReportChartValue(null)).toBe("Unavailable");
    const spec:ReportChartSpec={kind:"comparison",title:"Report",description:"Fixture",valueLabel:"Counts",points:[{id:"a",label:"A",value:0},{id:"b",label:"B",value:null}]};
    expect(hasNonzeroReportChartValues(spec)).toBe(false);
    expect(hasNonzeroReportChartValues({...spec,points:[{id:"a",label:"A",value:1}]})).toBe(true);
  });
});

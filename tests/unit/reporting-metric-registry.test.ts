import { describe, expect, it } from "vitest";
import {
  buildCurrentReportingMetricRegistry, requireMetricContract,
} from "@/domain/reporting-metric-registry";
import { CLASS_METRIC_DEFINITIONS } from "@/domain/participation-reporting";
import { NONCREDIT_PILOT_COUNT_DEFINITIONS } from "@/domain/noncredit-pilot-outcomes";

describe("source-owned metric registry",()=>{
  const all = buildCurrentReportingMetricRegistry();
  it("reuses every established domain metric instead of duplicating definitions",()=>{
    expect(all).toHaveLength(CLASS_METRIC_DEFINITIONS.length +
      NONCREDIT_PILOT_COUNT_DEFINITIONS.length);
    expect(new Set(all.map(m=>m.metricKey)).size).toBe(all.length);
    expect(all.every(m=>m.source&&m.denominator&&m.rule&&m.timeBasis))
      .toBe(true);
  });
  it("disambiguates superficially similar counts with distinct source domains",()=>{
    const classRegistration=all.find(m=>m.metricKey==="class.registrations");
    const noncreditRegistration=all.find(m=>m.metricKey==="noncredit.registrations");
    expect(classRegistration?.sourceDomain).toBe("native_class");
    expect(noncreditRegistration?.sourceDomain).toBe("noncredit_pilot");
    expect(classRegistration?.source).not.toBe(noncreditRegistration?.source);
  });
  it("requires exact metric definition versions before reuse",()=>{
    const metric=all.find(m=>m.metricKey==="class.registrations")!;
    expect(requireMetricContract(all,metric.metricKey,metric.definitionVersion)).toBe(metric);
    expect(()=>requireMetricContract(all,metric.metricKey,"not-ratified")).toThrow("Unknown");
  });
  it("does not silently upgrade private counts into published impact metrics",()=>{
    expect(all.every(m=>m.disclosure==="private_operational")).toBe(true);
  });
});

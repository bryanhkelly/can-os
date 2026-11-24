import {CAMPAIGN_METRIC_DEFINITIONS} from "@/domain/campaign-metrics";
import { describe, expect, it } from "vitest";
import {
  buildCurrentReportingMetricRegistry, requireMetricContract,
} from "@/domain/reporting-metric-registry";
import { CLASS_METRIC_DEFINITIONS } from "@/domain/participation-reporting";
import { validateMeasurementPlanAgainstRegistry } from "@/domain/measurement-plan-contract";
import { NONCREDIT_PILOT_COUNT_DEFINITIONS } from "@/domain/noncredit-pilot-outcomes";
import { GO_LINK_METRIC_DEFINITIONS } from "@/domain/go-link-evidence-metrics";

describe("source-owned metric registry",()=>{
  const all = buildCurrentReportingMetricRegistry();
  it("reuses every established domain metric instead of duplicating definitions",()=>{
    expect(all).toHaveLength(CLASS_METRIC_DEFINITIONS.length +
      NONCREDIT_PILOT_COUNT_DEFINITIONS.length + GO_LINK_METRIC_DEFINITIONS.length + CAMPAIGN_METRIC_DEFINITIONS.length);
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
  it("does not represent anonymous redirect observations as verified conversions",()=>{
    const clicks=all.find(m=>m.metricKey==="go.observedRedirects30d");
    const registrations=all.find(m=>m.metricKey==="go.referralNoncreditRegistrations30d");
    expect(clicks?.sourceDomain).toBe("go_link");
    expect(clicks?.rule).toContain("Go Link");
    expect(clicks?.denominator).toContain("not a unique visitor");
    expect(registrations?.source).toContain("noncredit_self_enrollment_claims");
    expect(registrations?.denominator).toContain("No click-to-enrollment");
  });
  it("distinguishes Go response types and unclassified historical entries",()=>{
    const opens=all.find(m=>m.metricKey==="go.linkOpens30d");
    const pages=all.find(m=>m.metricKey==="go.pageViews30d");
    const redirects=all.find(m=>m.metricKey==="go.redirectResponses30d");
    const legacy=all.find(m=>m.metricKey==="go.unclassifiedEntries30d");
    expect(opens?.rule).toContain("link_opens");
    expect(pages?.rule).toContain("page_views");
    expect(redirects?.rule).toContain("redirect_responses");
    expect(legacy?.rule).toContain("do not infer");
  });
  it("requires exact metric definition versions before reuse",()=>{
    const metric=all.find(m=>m.metricKey==="class.registrations")!;
    expect(requireMetricContract(all,metric.metricKey,metric.definitionVersion)).toBe(metric);
    expect(()=>requireMetricContract(all,metric.metricKey,"not-ratified")).toThrow("Unknown");
  });
  it("requires an exact, source-consistent version in Measurement Plans",()=>{
    const metric=all.find(row=>row.metricKey==="noncredit.registrations")!;
    const plan={
      schemaVersion:1 as const, version:"1",
      owner:{kind:"solution" as const,versionId:"44444444-4444-4444-8444-444444444444"},
      metrics:[{metricKey:metric.metricKey,definitionVersion:metric.definitionVersion,
        required:true,purpose:"activity" as const,
        sourceAuthority:metric.sourceDomain,
        evidenceRequirement:"Canonical noncredit registration ID"}],
    };
    expect(validateMeasurementPlanAgainstRegistry(plan,all)).toMatchObject(plan);
    expect(()=>validateMeasurementPlanAgainstRegistry({
      ...plan, metrics:[{...plan.metrics[0],definitionVersion:"unknown"}],
    },all)).toThrow("Unknown metric");
    expect(()=>validateMeasurementPlanAgainstRegistry({
      ...plan, metrics:[{...plan.metrics[0],sourceAuthority:"native_class"}],
    },all)).toThrow("source authority");
  });
  it("distinguishes provider acceptance from delivery and human reach",()=>{
    expect(all.find(m=>m.metricKey==="campaign.accepted")?.rule).toContain("later bounces");
    expect(all.find(m=>m.metricKey==="campaign.delivered")?.rule).toContain("receipt");
    expect(all.find(m=>m.metricKey==="campaign.total")?.denominator).toContain("not distinct people");
  });
  it("does not silently upgrade private counts into published impact metrics",()=>{
    expect(all.every(m=>m.disclosure==="private_operational")).toBe(true);
  });
});

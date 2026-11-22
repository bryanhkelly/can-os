import { describe, expect, it, vi } from "vitest";
import {
  buildReportingSourceEnvelope, reportingSourceDedupKey,
  reportingSourceInputSchema,
} from "@/domain/reporting-source-contract";
import { extendMeasurementPlan, measurementPlanSchema } from "@/domain/measurement-plan-contract";

const org="11111111-1111-4111-8111-111111111111";
const site="22222222-2222-4222-8222-222222222222";
const source="33333333-3333-4333-8333-333333333333";
const sample = {
  eventType:"SiteInformationUpdated",
  source:{ kind:"site", id:source, version:"2026-11-21T16:00:00.000Z" },
  occurredAt:"2026-11-21T16:00:00-08:00",
  dimensions:{ organizationId:org, siteId:site },
  evidenceClass:"operational_record" as const,
};

describe("reusable reporting source contract",()=>{
  it("normalizes one operational fact with stable deduplication and scope",()=>{
    const a=buildReportingSourceEnvelope(sample);
    const b=buildReportingSourceEnvelope(sample);
    expect(a).toEqual(b);
    expect(a.contractVersion).toBe("1.0.0");
    expect(a.dimensions.siteId).toBe(site);
    expect(a.occurredAt).toBe("2026-11-22T00:00:00.000Z");
    expect(a.dedupKey).toBe(reportingSourceDedupKey(sample));
  });
  it("rejects missing source IDs, missing Organization and invented dimensions",()=>{
    expect(reportingSourceInputSchema.safeParse({
      ...sample,dimensions:{ siteId:site },
    }).success).toBe(false);
    expect(reportingSourceInputSchema.safeParse({
      ...sample,source:{...sample.source,id:"not-uuid"},
    }).success).toBe(false);
    expect(reportingSourceInputSchema.safeParse({
      ...sample,dimensions:{...sample.dimensions,personEmail:"private@example.com"},
    }).success).toBe(false);
  });
  it("keeps scheduled time separate from authoritative occurrence",()=>{
    const x=buildReportingSourceEnvelope(sample);
    expect(Object.keys(x)).not.toContain("scheduledAt");
  });
});

describe("reusable Measurement Plan contract",()=>{
  const inherited={
    schemaVersion:1 as const,version:"1",owner:{kind:"solution" as const,versionId:source},
    metrics:[{metricKey:"participation.registrations",definitionVersion:"1.0.0",required:true,
      purpose:"activity" as const,sourceAuthority:"noncredit_registration",
      evidenceRequirement:"Canonical registration ID"}],
  };
  it("inherits mandatory measurement rules and accepts local targets",()=>{
    const next=extendMeasurementPlan(inherited,{
      version:"2",targets:{"participation.registrations":40},
      additions:[{metricKey:"learning.knowledge_gain",definitionVersion:"1.0.0",required:false,
        purpose:"observed_outcome",sourceAuthority:"assessment_decision",
        evidenceRequirement:"Comparable pre and post assessments"}],
    });
    expect(next.metrics[0]).toMatchObject({required:true,target:40,
      sourceAuthority:"noncredit_registration"});
    expect(next.metrics[1].metricKey).toBe("learning.knowledge_gain");
  });
  it("rejects duplicate metric keys and local redefinition of required evidence",()=>{
    expect(measurementPlanSchema.safeParse({
      ...inherited,metrics:[...inherited.metrics,...inherited.metrics],
    }).success).toBe(false);
    expect(()=>extendMeasurementPlan(inherited,{
      version:"2",additions:[{...inherited.metrics[0],required:false}],
    })).toThrow("cannot be overridden");
  });
  it("refuses weakening a mandatory inherited target or mutating the same version",()=>{
    const mandatory={...inherited,metrics:[{...inherited.metrics[0],target:50}]};
    expect(()=>extendMeasurementPlan(mandatory,{version:"1",targets:{"participation.registrations":60}}))
      .toThrow("distinct immutable version");
    expect(()=>extendMeasurementPlan(mandatory,{version:"2",targets:{"participation.registrations":20}}))
      .toThrow("cannot be weakened");
    expect(()=>extendMeasurementPlan(mandatory,{version:"2",targets:{"participation.registrations":null}}))
      .toThrow("cannot be weakened");
    expect(extendMeasurementPlan(mandatory,{version:"2",targets:{"participation.registrations":60}})
      .metrics[0]?.target).toBe(60);
  });
  it("rejects targets for unknown metrics instead of silently ignoring them",()=>{
    expect(()=>extendMeasurementPlan(inherited,{version:"2",targets:{"unknown.metric":1}}))
      .toThrow("unknown measurement");
  });
});

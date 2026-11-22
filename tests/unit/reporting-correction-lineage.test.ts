import { describe, expect, it } from "vitest";
import { assertReportingCorrectionLineage } from "@/domain/reporting-correction-lineage";
import { buildReportingSourceEnvelope } from "@/domain/reporting-source-contract";
import { EventTypes } from "@/domain/event-types";

const organizationId="11111111-1111-4111-8111-111111111111";
const siteId="22222222-2222-4222-8222-222222222222";
const sourceId="33333333-3333-4333-8333-333333333333";
const time=new Date("2026-11-21T10:00:00Z");
const scope={organizationId,siteId,programId:null};
const correction={aggregateType:"site_room",aggregateId:sourceId,
  occurredAt:new Date("2026-11-21T11:00:00Z"),
  sourceKind:"site_room",sourceId,scope};
const reporting=buildReportingSourceEnvelope({
  eventType:EventTypes.SiteRoomCreated,
  source:{kind:"site_room",id:sourceId,version:"1"},
  occurredAt:time.toISOString(),
  dimensions:{organizationId,siteId},
  evidenceClass:"operational_record",
});
function prior() {
  return {aggregateType:"site_room",aggregateId:sourceId,occurredAt:time,
    payload:{organizationId,siteId,reporting}};
}
describe("reporting correction lineage",()=>{
  it("accepts a normalized predecessor from the same canonical owner",()=>{
    expect(()=>assertReportingCorrectionLineage(correction,prior())).not.toThrow();
  });
  it("rejects an unrelated aggregate or future predecessor",()=>{
    expect(()=>assertReportingCorrectionLineage(correction,{...prior(),aggregateId:siteId})).toThrow("unrelated");
    expect(()=>assertReportingCorrectionLineage(correction,{...prior(),occurredAt:new Date("2026-11-22T00:00:00Z")})).toThrow("future");
  });
  it("rejects a predecessor reassigned to a sibling Site in both attribution layers",()=>{
    const record=prior();
    expect(()=>assertReportingCorrectionLineage(correction,{
      ...record,payload:{...record.payload,siteId:"44444444-4444-4444-8444-444444444444"},
    })).toThrow("ownership");
    const metadata=buildReportingSourceEnvelope({
      eventType:EventTypes.SiteRoomCreated,
      source:{kind:"site_room",id:sourceId,version:"1"},occurredAt:time.toISOString(),
      dimensions:{organizationId,siteId:"44444444-4444-4444-8444-444444444444"},
      evidenceClass:"operational_record",
    });
    expect(()=>assertReportingCorrectionLineage(correction,{
      ...record,payload:{...record.payload,reporting:metadata},
    })).toThrow("ownership");
  });
  it("rejects a hidden Program claim or a different normalized source identity",()=>{
    const record=prior();
    expect(()=>assertReportingCorrectionLineage(correction,{
      ...record,payload:{...record.payload,programId:sourceId},
    })).toThrow("ownership");
    expect(()=>assertReportingCorrectionLineage(correction,{
      ...record,payload:{...record.payload,reporting:{...reporting,source:{...reporting.source,id:siteId}}},
    })).toThrow("ownership");
  });
  it("fails closed on legacy predecessors and altered timestamps",()=>{
    const record=prior();
    expect(()=>assertReportingCorrectionLineage(correction,{
      ...record,payload:{organizationId,siteId},
    })).toThrow("without normalized");
    expect(()=>assertReportingCorrectionLineage(correction,{
      ...record,payload:{...record.payload,reporting:{...reporting,occurredAt:"2026-11-21T09:00:00.000Z"}},
    })).toThrow("ownership");
  });
});

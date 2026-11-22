import { describe, expect, it } from "vitest";
import { EventTypes } from "@/domain/event-types";
import { buildReportingSourceEnvelope } from "@/domain/reporting-source-contract";
import { projectAuthorizedSourceEvents } from "@/domain/reporting-source-projection";

const org = "11111111-1111-4111-8111-111111111111";
const site = "22222222-2222-4222-8222-222222222222";
const otherSite = "33333333-3333-4333-8333-333333333333";
const room = "44444444-4444-4444-8444-444444444444";
const eventId = "55555555-5555-4555-8555-555555555555";
const scope = { verifiedOrganizationIds: new Set([org]), verifiedSiteIds: new Set([site]) };
const period = {
  from: "2026-11-20T00:00:00Z",
  to: "2026-11-22T00:00:00Z",
  asOf: "2026-11-22T01:00:00Z",
};
function roomEvent(overrides: Record<string, unknown> = {}) {
  const reporting = buildReportingSourceEnvelope({
    eventType:EventTypes.SiteRoomCreated,
    source:{kind:"site_room",id:room,version:"1"},
    occurredAt:"2026-11-21T10:00:00Z",
    dimensions:{organizationId:org,siteId:site},
    evidenceClass:"operational_record",
  });
  return {
    id:eventId, eventType:EventTypes.SiteRoomCreated,
    aggregateType:"site_room",aggregateId:room,
    occurredAt:new Date("2026-11-21T10:00:00Z"),
    payload:{capacity:25,organizationId:org,siteId:site,reporting},
    ...overrides,
  };
}
describe("authorized source projection",()=>{
  it("deduplicates identical event deliveries, preserving observed counts",()=>{
    const event=roomEvent();
    const result=projectAuthorizedSourceEvents([event,event],scope,period);
    expect(result.observedCounts).toEqual({[EventTypes.SiteRoomCreated]:1});
    expect(result.coverage).toMatchObject({status:"normalized",duplicateDeliveries:1,lifecycleCompletenessVerified:false});
    expect(result.events[0]?.sourceId).toBe(room);
  });
  it("deduplicates distinct event IDs with identical source versions",()=>{
    const first=roomEvent(), duplicate={...first,id:"66666666-6666-4666-8666-666666666666"};
    const result=projectAuthorizedSourceEvents([first,duplicate],scope,period);
    expect(result.events).toHaveLength(1);
    expect(result.coverage.duplicateDeliveries).toBe(1);
  });
  it("rejects changed payloads for a duplicated source revision",()=>{
    const first=roomEvent();
    const second={...first,id:"66666666-6666-4666-8666-666666666666",
      payload:{...first.payload,capacity:30}};
    expect(()=>projectAuthorizedSourceEvents([first,second],scope,period))
      .toThrow("Conflicting source revisions");
  });
  it("denies other Sites even if the caller includes their events",()=>{
    const first=roomEvent();
    const bad={...first,payload:{...first.payload,siteId:otherSite}};
    expect(()=>projectAuthorizedSourceEvents([bad],scope,period)).toThrow("disagree");
    const copied=buildReportingSourceEnvelope({
      eventType:EventTypes.SiteRoomCreated,source:{kind:"site_room",id:room,version:"1"},
      occurredAt:"2026-11-21T10:00:00Z",dimensions:{organizationId:org,siteId:otherSite},
      evidenceClass:"operational_record",
    });
    expect(()=>projectAuthorizedSourceEvents([{
      ...first,payload:{...first.payload,siteId:otherSite,reporting:copied},
    }],scope,period)).toThrow("outside");
  });
  it("does not count out-of-scope legacy events",()=>{
    const first=roomEvent(),{reporting:_reporting,...legacy}=first.payload;
    expect(()=>projectAuthorizedSourceEvents([{
      ...first,payload:{...legacy,siteId:otherSite},
    }],scope,period)).toThrow("Out-of-scope");
  });
  it("makes incomplete legacy coverage explicit instead of reporting zero",()=>{
    const first=roomEvent(),{reporting:_reporting,...legacy}=first.payload;
    const result=projectAuthorizedSourceEvents([{...first,payload:legacy}],scope,period);
    expect(result.events).toHaveLength(0);
    expect(result.coverage).toMatchObject({status:"legacy_detected",legacyEvents:1});
  });
  it("surfaces a correction outside the loaded history without treating it as reconciled",()=>{
    const original=roomEvent();
    const priorId="66666666-6666-4666-8666-666666666666";
    const metadata=buildReportingSourceEnvelope({
      eventType:EventTypes.SiteRoomCreated,
      source:{kind:"site_room",id:room,version:"2"},
      occurredAt:"2026-11-21T11:00:00Z",
      dimensions:{organizationId:org,siteId:site},
      evidenceClass:"operational_record",correctsEventId:priorId,
    });
    const corrected={...original,
      id:"77777777-7777-4777-8777-777777777777",
      occurredAt:new Date("2026-11-21T11:00:00Z"),
      payload:{...original.payload,capacity:26,reporting:metadata}};
    const result=projectAuthorizedSourceEvents([corrected],scope,period);
    expect(result.coverage).toMatchObject({
      status:"unresolved_corrections",unresolvedCorrectionReferences:1,
      lifecycleCompletenessVerified:false,
    });
  });
  it("rejects sensitive fields in event bodies, not just invalid metadata",()=>{
    const first=roomEvent();
    expect(()=>projectAuthorizedSourceEvents([{
      ...first,payload:{...first.payload,studentEmail:"not-for-event@example.org"},
    }],scope,period)).toThrow();
  });
  it("Site-owned room events never gain a Program attribution from their mutation caller",()=>{
    const record=roomEvent();
    const result=projectAuthorizedSourceEvents([record],scope,period);
    expect(result.events[0]?.programId).toBeNull();
  });
  it("requires current grants and a valid bounded reporting period",()=>{
    expect(()=>projectAuthorizedSourceEvents([roomEvent()],{
      verifiedOrganizationIds:new Set(), verifiedSiteIds:new Set([site]),
    },period)).toThrow("Verified");
    expect(()=>projectAuthorizedSourceEvents([roomEvent()],scope,{
      ...period,to:"2026-11-19T00:00:00Z",
    })).toThrow("Invalid");
  });
});

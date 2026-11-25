import { describe, expect, it, vi } from "vitest";
import { EventTypes } from "@/domain/event-types";
import { normalizeHistoricalReportablePayload, validateReportableEvent,
  REPORTABLE_EVENT_CATALOG } from "@/domain/reportable-event-catalog";
import { emitReportableChange, emitReportableEvent } from "@/platform/reportable-event";

const org = "11111111-1111-4111-8111-111111111111";
const site = "22222222-2222-4222-8222-222222222222";
const room = "33333333-3333-4333-8333-333333333333";
const payload = { capacity: 24 };
const input = {
  eventType: EventTypes.SiteRoomCreated,
  aggregateType: "site_room" as const,
  aggregateId: room,
  source: { kind: "site_room" as const, id: room, version: "1" },
  dimensions: { organizationId: org, siteId: site },
  evidenceClass: "operational_record" as const,
  occurredAt: new Date("2026-11-21T21:30:00Z"),
  payload,
};

describe("governed event catalog", () => {
  it("registers one explicit schema version per event", () => {
    expect(Object.values(REPORTABLE_EVENT_CATALOG).every(spec =>
      spec.schemaVersion === 1)).toBe(true);
  });
  it("upcasts an explicitly versioned historical room event without copying its name", () => {
    expect(normalizeHistoricalReportablePayload({
      ...input, schemaVersion: 0,
      payload: {name: "Legacy Hall", capacity:24},
    })).toEqual({capacity:24});
  });
  it("fails closed for unsupported or unversioned unknown historical payloads", () => {
    expect(() => normalizeHistoricalReportablePayload({
      ...input,schemaVersion:3,
    })).toThrow("Unsupported historical");
    expect(() => normalizeHistoricalReportablePayload({
      ...input,payload:{name:"Legacy Hall",capacity:24},
    })).toThrow();
  });
  it("accepts a matching authoritative event", () => {
    expect(validateReportableEvent(input)).toEqual(payload);
  });
  it("rejects unregistered types and mismatched sources", () => {
    expect(() => validateReportableEvent({...input, eventType:"UnknownEvent"})).toThrow("Unregistered");
    expect(() => validateReportableEvent({...input, source:{...input.source,kind:"class"}}))
      .toThrow("disagree");
  });
  it("rejects a Program context masquerading as ownership of Site rooms", () => {
    expect(() => validateReportableEvent({
      ...input,dimensions:{...input.dimensions,
        programId:"44444444-4444-4444-8444-444444444444"},
    })).toThrow("Site-owned");
  });
  it("rejects omitted dimensions and unexpected sensitive fields", () => {
    expect(() => validateReportableEvent({...input, dimensions:{organizationId:org}}))
      .toThrow("dimension");
    expect(() => validateReportableEvent({...input, payload:{...payload, email:"private@example.org"}}))
      .toThrow();
  });
  it("rejects raw generated content and campaign recipient identities",()=>{
    const base={...input,aggregateType:"site_intelligence_version",source:{...input.source,kind:"site_intelligence_version"},eventType:EventTypes.SiteIntelligenceProcessingCompleted};
    const valid={attempt:1,outputId:room};
    expect(validateReportableEvent({...base,payload:valid})).toEqual(valid);
    expect(()=>validateReportableEvent({...base,payload:{...valid,output:"Private text"}})).toThrow();
    const campaign={...input,aggregateType:"site_campaign",source:{...input.source,kind:"site_campaign"},eventType:EventTypes.SiteCampaignQueued};
    const queue={engagementId:site,linkId:room,recipientCount:10,scheduledAt:input.occurredAt.toISOString()};
    expect(validateReportableEvent({...campaign,payload:queue})).toEqual(queue);
    expect(()=>validateReportableEvent({...campaign,payload:{...queue,email:"private@example.org"}})).toThrow();
  });
  it("does not write when validation fails", async () => {
    const insert = vi.fn();
    await expect(emitReportableEvent({insert} as never,
      {...input,payload:{...payload,email:"private@example.org"}} as never)).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
  it("derives aggregate and source kinds from one shared catalog", async () => {
    const returning=vi.fn(async ()=>[{id:"44444444-4444-4444-8444-444444444444"}]);
    const values=vi.fn((_row:Record<string,unknown>)=>({returning}));
    const insert=vi.fn(()=>({values}));
    await emitReportableChange({insert} as never,{
      eventType:EventTypes.SiteRoomCreated,sourceId:room,sourceVersion:"1",
      occurredAt:input.occurredAt,dimensions:input.dimensions,payload,
    });
    const event=values.mock.calls[0]?.[0] as Record<string,unknown>;
    expect(event.aggregateType).toBe("site_room");
    expect(event.aggregateId).toBe(room);
    expect(event.payload).toMatchObject({
      reporting:{source:{kind:"site_room",id:room},evidenceClass:"operational_record"},
    });
    expect(insert).toHaveBeenCalledTimes(1);
  });
  it("passes exactly one source-linked event to the canonical outbox writer", async () => {
    const returning = vi.fn(async () => [{id:"44444444-4444-4444-8444-444444444444"}]);
    const values = vi.fn((_row: Record<string, unknown>) => ({returning}));
    const insert = vi.fn(() => ({values}));
    const id = await emitReportableEvent({insert} as never, input);
    expect(id).toBe("44444444-4444-4444-8444-444444444444");
    expect(insert).toHaveBeenCalledTimes(1);
    const written = values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(written.eventType).toBe(EventTypes.SiteRoomCreated);
    expect(written.payload).toMatchObject({
      organizationId:org,siteId:site,
      reporting:{source:{id:room,version:"1"},dimensions:{organizationId:org,siteId:site}},
    });
    expect((written.payload as Record<string, unknown>).email).toBeUndefined();
  });
});

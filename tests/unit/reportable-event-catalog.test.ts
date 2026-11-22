import { describe, expect, it, vi } from "vitest";
import { EventTypes } from "@/domain/event-types";
import { validateReportableEvent } from "@/domain/reportable-event-catalog";
import { emitReportableEvent } from "@/platform/reportable-event";

const org = "11111111-1111-4111-8111-111111111111";
const site = "22222222-2222-4222-8222-222222222222";
const room = "33333333-3333-4333-8333-333333333333";
const payload = { name: "Community room", capacity: 24 };
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
  it("accepts a matching authoritative event", () => {
    expect(validateReportableEvent(input)).toEqual(payload);
  });
  it("rejects unregistered types and mismatched sources", () => {
    expect(() => validateReportableEvent({...input, eventType:"UnknownEvent"})).toThrow("Unregistered");
    expect(() => validateReportableEvent({...input, source:{...input.source,kind:"class"}}))
      .toThrow("disagree");
  });
  it("rejects omitted dimensions and unexpected sensitive fields", () => {
    expect(() => validateReportableEvent({...input, dimensions:{organizationId:org}}))
      .toThrow("dimension");
    expect(() => validateReportableEvent({...input, payload:{...payload, email:"private@example.org"}}))
      .toThrow();
  });
  it("does not write when validation fails", async () => {
    const insert = vi.fn();
    await expect(emitReportableEvent({insert} as never,
      {...input,payload:{...payload,email:"private@example.org"}} as never)).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
  it("passes exactly one source-linked event to the canonical outbox writer", async () => {
    const returning = vi.fn(async () => [{id:"44444444-4444-4444-8444-444444444444"}]);
    const values = vi.fn(() => ({returning}));
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

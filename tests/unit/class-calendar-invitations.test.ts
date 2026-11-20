import { describe, expect, it } from "vitest";
import { classSessionCalendarUid, foldCalendarLine, renderCalendarInvitation } from "../../src/domain/calendar-invitations";

const event = {
  uid: classSessionCalendarUid("11111111-1111-4111-8111-111111111111"),
  summary: "AI, Digital Skills; Session 1",
  startsAt: new Date("2026-11-24T18:00:00.000Z"),
  endsAt: new Date("2026-11-24T19:00:00.000Z"),
  description: "Learning\nSession",
};
describe("Class ICS invitations", () => {
  it("emits stable REQUEST invitations with escaped content and valid UTC instants", () => {
    const ics = renderCalendarInvitation([event], "REQUEST", new Date("2026-11-20T00:00:00Z"));
    expect(ics).toContain("METHOD:REQUEST\r\n");
    expect(ics).toContain("UID:class-session-11111111-1111-4111-8111-111111111111@can-os");
    expect(ics).toContain("DTSTART:20261124T180000Z");
    expect(ics).toContain("DTEND:20261124T190000Z");
    expect(ics).toContain("SUMMARY:AI\\, Digital Skills\\; Session 1");
    expect(ics).toContain("DESCRIPTION:Learning\\nSession");
    expect(ics).toContain("SEQUENCE:0");
  });
  it("cancels the same UID and never invents another calendar identity", () => {
    const request = renderCalendarInvitation([event], "REQUEST");
    const cancel = renderCalendarInvitation([{...event, sequence: 1}], "CANCEL");
    expect(cancel).toContain("METHOD:CANCEL");
    expect(cancel).toContain("STATUS:CANCELLED");
    expect(cancel).toContain("SEQUENCE:1");
    expect(cancel.match(/UID:[^\r\n]+/)?.[0]).toBe(request.match(/UID:[^\r\n]+/)?.[0]);
  });
  it("rejects impossible intervals, duplicate UIDs and injection", () => {
    expect(() => renderCalendarInvitation([{...event, endsAt: event.startsAt}], "REQUEST")).toThrow();
    expect(() => renderCalendarInvitation([event, event], "REQUEST")).toThrow();
    expect(() => renderCalendarInvitation([{...event, uid: "bad\r\nMETHOD:CANCEL"}], "REQUEST")).toThrow();
  });
  it("folds multi-byte Unicode without exceeding 75 UTF-8 octets", () => {
    const line = foldCalendarLine("SUMMARY:" + "🌱".repeat(70));
    expect(line.split("\r\n").every(part => new TextEncoder().encode(part).length <= 75)).toBe(true);
  });
});

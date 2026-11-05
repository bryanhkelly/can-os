import { describe, expect, it } from "vitest";
import {
  interestEventFollowUpTime,
  interestEventRegistrationEmailSchedule,
  renderInterestEventCalendar,
} from "@/domain/interest-event-delivery";

describe("interest event delivery schedule", () => {
  it("queues confirmation and only future 24-hour and 2-hour reminders", () => {
    const now = new Date("2027-01-14T16:30:00.000Z");
    const schedule = interestEventRegistrationEmailSchedule(new Date("2027-01-15T18:00:00.000Z"), now);
    expect(schedule).toEqual([
      { kind: "confirmation", deliverAt: now },
      { kind: "reminder_24h", deliverAt: new Date("2027-01-14T18:00:00.000Z") },
      { kind: "reminder_2h", deliverAt: new Date("2027-01-15T16:00:00.000Z") },
    ]);
  });

  it("does not queue reminders whose scheduled time already passed", () => {
    const now = new Date("2027-01-15T16:30:00.000Z");
    expect(interestEventRegistrationEmailSchedule(new Date("2027-01-15T18:00:00.000Z"), now))
      .toEqual([{ kind: "confirmation", deliverAt: now }]);
  });

  it("sends follow-up no earlier than the event end", () => {
    const now = new Date("2027-01-15T17:30:00.000Z");
    expect(interestEventFollowUpTime(new Date("2027-01-15T18:00:00.000Z"), now))
      .toEqual(new Date("2027-01-15T18:00:00.000Z"));
    expect(interestEventFollowUpTime(new Date("2027-01-15T17:00:00.000Z"), now)).toEqual(now);
  });

  it("renders escaped UTC calendar data with CRLF line endings", () => {
    const calendar = renderInterestEventCalendar({
      uid: "registration@example.test",
      title: "Open house, families; all welcome",
      description: "Meet the team\nBring questions",
      location: "Main hall",
      startsAt: new Date("2027-01-15T18:00:00.000Z"),
      endsAt: new Date("2027-01-15T19:00:00.000Z"),
      now: new Date("2027-01-01T00:00:00.000Z"),
    });
    expect(calendar).toContain("METHOD:PUBLISH\r\n");
    expect(calendar).toContain("DTSTART:20270115T180000Z\r\n");
    expect(calendar).toContain("SUMMARY:Open house\\, families\\; all welcome\r\n");
    expect(calendar).toContain("DESCRIPTION:Meet the team\\nBring questions\r\n");
    expect(calendar).toMatch(/\r\n$/);
  });
});
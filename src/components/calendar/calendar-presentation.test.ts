import { describe, expect, it } from "vitest";
import type { CalendarFeedItem } from "@/modules/calendar/calendar.functions";
import { formatTime, typeLabel, formatEventDate } from "./calendar-presentation";

const item=(source:string,type="event")=>({source,type} as CalendarFeedItem);
describe("shared calendar event presentation", () => {
  it("uses one set of labels for event lists and details", () => {
    expect(typeLabel(item("assessment"))).toBe("Due");
    expect(typeLabel(item("personal"))).toBe("Personal");
    expect(typeLabel(item("study_group"))).toBe("Study group");
    expect(typeLabel(item("section","class_time"))).toBe("Class time");
    expect(typeLabel(item("site","chapel"))).toBe("Chapel");
  });
  it("renders calendar time in the event timezone", () => {
    const instant="2026-11-19T20:00:00.000Z";
    expect(formatTime(instant,"America/Los_Angeles")).toContain("12:00");
    expect(formatEventDate(instant,"America/Los_Angeles")).toContain("November 19");
  });
});

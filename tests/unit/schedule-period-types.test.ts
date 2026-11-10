import { describe, expect, it } from "vitest";
import {
  HOMEROOM_DEFAULT_MINUTES,
  isSectionMeetingPeriodType,
  SCHEDULE_PERIOD_TYPES,
  SECTION_MEETING_PERIOD_TYPES,
} from "@/domain/schedule-period-types";
import { summarizeExpectedOnsiteAttendance } from "@/domain/expected-attendance";
import { projectPublicSchoolDay, publicSchoolDayScheduleSignature } from "@/domain/public-school-day";

describe("schedule period vocabulary", () => {
  it("binds homeroom to section rosters but keeps chapel a site-wide gathering", () => {
    expect(isSectionMeetingPeriodType("instruction")).toBe(true);
    expect(isSectionMeetingPeriodType("homeroom")).toBe(true);
    expect(isSectionMeetingPeriodType("chapel")).toBe(false);
    expect(isSectionMeetingPeriodType("advisory")).toBe(false);
    expect(isSectionMeetingPeriodType("break")).toBe(false);
  });

  it("keeps every section-meeting type inside the canonical vocabulary", () => {
    for (const type of SECTION_MEETING_PERIOD_TYPES) {
      expect(SCHEDULE_PERIOD_TYPES).toContain(type);
    }
    expect(SCHEDULE_PERIOD_TYPES).toContain("chapel");
    expect(HOMEROOM_DEFAULT_MINUTES).toBe(25);
  });

  it("counts homeroom-only days as expected onsite days, but never chapel-only days", () => {
    const base = {
      program: { id: "program", organizationId: "organization", siteId: "site", deliveryModel: { onsite: true } },
      timeZone: "America/Los_Angeles",
      asOf: new Date("2026-11-04T08:30:00Z"),
      windowDays: 2,
      years: [{ id: "year", siteId: "site", organizationId: "organization", programId: "program", status: "active", startsOn: "2026-01-01", endsOn: "2026-12-31" }],
      calendars: [{ id: "calendar", schoolYearId: "year", siteId: "site", active: true, version: 1 }],
      calendarDays: ["2026-11-02", "2026-11-03"].map(calendarDate => ({
        academicCalendarId: "calendar", calendarDate, type: "instructional", instructionalMinutes: 25,
      })),
      schedules: [{ id: "schedule", schoolYearId: "year", siteId: "site", programId: "program", active: true,
        effectiveFrom: "2026-01-01", effectiveThrough: null }],
      enrollments: [{ studentProfileId: "student", programId: "program", schoolYearId: "year", startedAt: null, endedAt: null }],
      effectiveFacts: [],
    };
    const homeroomOnly = summarizeExpectedOnsiteAttendance({
      ...base,
      periods: [1, 2].map(dayOfWeek => ({ scheduleTemplateId: "schedule", dayOfWeek, type: "homeroom" })),
    });
    expect(homeroomOnly).toMatchObject({ expectedDays: 2, unmarkedExpectedDays: 2 });

    const chapelOnly = summarizeExpectedOnsiteAttendance({
      ...base,
      periods: [1, 2].map(dayOfWeek => ({ scheduleTemplateId: "schedule", dayOfWeek, type: "chapel" })),
    });
    expect(chapelOnly.expectedDays).toBe(0);
  });

  it("accepts homeroom as a known displayed type in the approved public school day", () => {
    const periods = [
      { dayOfWeek: 1, startsAtLocal: "07:30", endsAtLocal: "07:55", type: "homeroom" },
      { dayOfWeek: 1, startsAtLocal: "08:00", endsAtLocal: "15:00", type: "instruction" },
    ];
    const schedule = {
      schoolYearStatus: "active", templateActive: true,
      programMatches: true, siteMatches: true, timezoneMatches: true,
      startsOn: "2026-08-01", endsOn: "2027-06-30",
      effectiveFrom: "2026-08-01", effectiveThrough: null,
      approval: { status: "approved" as const, revision: 1,
        reviewedByPersonId: "institutional-reviewer", reviewedAt: "2026-11-02T12:00:00Z",
        signature: publicSchoolDayScheduleSignature(periods) },
      periods,
    };
    const projected = projectPublicSchoolDay([schedule], "America/Los_Angeles", new Date("2026-11-03T18:00:00Z"));
    expect(projected.state).toBe("approved");
    expect(projected.days.value).toEqual([1]);
  });
});

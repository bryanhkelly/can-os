import { describe, expect, it } from "vitest";
import { projectPublicSchoolDay, publicSchoolDayScheduleSignature } from "@/domain/public-school-day";

const now = new Date("2026-11-03T18:00:00Z");
const schedule = {
  schoolYearStatus: "active", templateActive: true,
  programMatches: true, siteMatches: true, timezoneMatches: true,
  startsOn: "2026-08-01", endsOn: "2027-06-30",
  effectiveFrom: "2026-08-01", effectiveThrough: null,
  approval: { status: "approved" as const, revision: 2,
    reviewedByPersonId: "institutional-reviewer", reviewedAt: "2026-11-02T12:00:00Z",
    signature: publicSchoolDayScheduleSignature([
      {dayOfWeek:0,startsAtLocal:"09:00",endsAtLocal:"12:00",type:"instruction"},
      {dayOfWeek:0,startsAtLocal:"10:00",endsAtLocal:"10:30",type:"chapel"},
      {dayOfWeek:3,startsAtLocal:"09:00",endsAtLocal:"14:00",type:"instruction"},
    ]) },
  periods: [
    {dayOfWeek: 0, startsAtLocal: "09:00", endsAtLocal: "12:00", type: "instruction"},
    {dayOfWeek: 0, startsAtLocal: "10:00", endsAtLocal: "10:30", type: "chapel"},
    {dayOfWeek: 3, startsAtLocal: "09:00", endsAtLocal: "14:00", type: "instruction"},
  ],
};
describe("approved public school-day projection", () => {
  it("includes Sunday and never assumes a Monday through Friday school", () => {
    const actual = projectPublicSchoolDay([schedule], "America/Los_Angeles", now);
    expect(actual.state).toBe("approved");
    expect(actual.days.value).toEqual([0,3]);
    expect(actual.startTime.value).toBe("09:00");
    expect(actual.endTime.value).toBe("14:00");
    expect(actual.mode.canDisplay).toBe(false);
  });
  it("holds unapproved, inactive, cross-program, and contradictory schedules", () => {
    for (const change of [
      {approval: null}, {schoolYearStatus:"draft"},
      {programMatches:false}, {timezoneMatches:false},
    ]) {
      const actual = projectPublicSchoolDay([{...schedule,...change}],
        "America/Los_Angeles", now);
      expect(actual.state).toBe("pending");
      expect(actual.days.canDisplay).toBe(false);
    }
    expect(projectPublicSchoolDay([schedule, schedule], "America/Los_Angeles", now).state)
      .toBe("pending");
  });
  it("withdraws schedule claims when reviewed periods have changed", () => {
    const changed={...schedule,periods:[...schedule.periods,{dayOfWeek:6,startsAtLocal:"09:00",endsAtLocal:"12:00",type:"instruction"}]};
    expect(projectPublicSchoolDay([changed],"America/Los_Angeles",now).state).toBe("pending");
  });
  it("withdraws expired academic schedules", () => {
    expect(projectPublicSchoolDay([{...schedule,endsOn:"2026-10-01"}],
      "America/Los_Angeles", now).state).toBe("pending");
  });
});

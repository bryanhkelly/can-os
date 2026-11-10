import { describe, expect, it } from "vitest";
import {
  addCalendarDays, calendarMonthWindow, calendarWeekday, dateKeyInTimezone, dateOnlyDayBoundsInTimezone,
  dateOnlyDayStartInTimezone, dateTimeInputInTimezone, dateTimeInputValue,
  formatDateOnly, formatTimestamp, isValidDateOnly, isValidTimeZone, localDayBoundsInTimezone,
  todayInTimezone,
} from "@/modules/calendar/timezone";

describe("calendar timezone conversion", () => {
  it("includes the first and last school-local days across timezones and DST", () => {
    const october = calendarMonthWindow(2026, 10);
    expect(october.start.toISOString()).toBe("2026-09-30T10:00:00.000Z");
    expect(october.end.toISOString()).toBe("2026-11-01T14:00:00.000Z");
    expect(october.firstDate).toBe("2026-10-01");
    expect(october.afterLastDate).toBe("2026-11-01");
    const californiaLate = "2026-11-01T06:30:00.000Z";
    expect(dateKeyInTimezone(californiaLate, "America/Los_Angeles")).toBe("2026-10-31");
    expect(new Date(californiaLate).getTime()).toBeLessThan(october.end.getTime());
    const earlyPacific = "2026-09-30T10:30:00.000Z";
    expect(dateKeyInTimezone(earlyPacific, "Pacific/Kiritimati")).toBe("2026-10-01");
    expect(new Date(earlyPacific).getTime()).toBeGreaterThan(october.start.getTime());
    const march = calendarMonthWindow(2027, 3);
    expect(dateKeyInTimezone("2027-04-01T06:30:00.000Z", "America/Los_Angeles"))
      .toBe("2027-03-31");
    expect(march.end.toISOString()).toBe("2027-04-01T14:00:00.000Z");
  });
  it("round-trips event wall time in a non-browser timezone", () => {
    const instant = dateTimeInputInTimezone("2027-01-15T09:30", "America/Los_Angeles");
    expect(instant).toBe("2027-01-15T17:30:00.000Z");
    expect(dateTimeInputValue(instant, "America/Los_Angeles")).toBe("2027-01-15T09:30");
    expect(dateKeyInTimezone(instant, "America/Los_Angeles")).toBe("2027-01-15");
  });

  it("keeps Site-local deadlines on their calendar day across UTC midnight", () => {
    expect(dateKeyInTimezone("2027-01-15T01:00:00.000Z", "UTC")).toBe("2027-01-15");
    expect(dateKeyInTimezone("2027-01-15T01:00:00.000Z", "America/Los_Angeles")).toBe("2027-01-14");
  });
  it("uses the supplied instant and each Site timezone for policy dates", () => {
    const now = new Date("2027-01-15T07:30:00.000Z");
    expect(todayInTimezone("America/Los_Angeles", now)).toBe("2027-01-14");
    expect(todayInTimezone("America/New_York", now)).toBe("2027-01-15");
    expect(todayInTimezone("UTC", now)).toBe("2027-01-15");
  });
  it("rejects invalid policy timezones and invalid instants", () => {
    expect(() => todayInTimezone("No/Such_Zone")).toThrow("Invalid site timezone");
    expect(() => todayInTimezone("UTC", new Date(Number.NaN))).toThrow("Invalid timestamp");
  });

  it("uses daylight-saving offsets and rejects nonexistent local times", () => {
    expect(dateTimeInputInTimezone("2027-07-15T09:30", "America/Los_Angeles"))
      .toBe("2027-07-15T16:30:00.000Z");
    expect(() => dateTimeInputInTimezone("2027-03-14T02:30", "America/Los_Angeles"))
      .toThrow("does not exist");
    expect(dateTimeInputInTimezone("2027-11-07T01:30", "America/Los_Angeles"))
      .toBe("2027-11-07T08:30:00.000Z");
  });

  it("rejects invalid date/time input and timezone names", () => {
    expect(() => dateTimeInputInTimezone("2027-02-30T09:30", "UTC"))
      .toThrow("valid date and time");
    expect(() => dateTimeInputInTimezone("2027-01-15T09:30", "No/Such_Zone"))
      .toThrow();
  });
});

describe("school-local daily boundaries", () => {
  it("includes the local evening that belongs to the next UTC day", () => {
    const { start, end } = localDayBoundsInTimezone(new Date("2027-01-16T06:30:00Z"), "America/Los_Angeles");
    expect(start.toISOString()).toBe("2027-01-15T08:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-16T08:00:00.000Z");
  });
  it("handles the 23-hour spring and 25-hour autumn school day", () => {
    const spring = localDayBoundsInTimezone(new Date("2027-03-14T18:00:00Z"), "America/Los_Angeles");
    expect(spring.start.toISOString()).toBe("2027-03-14T08:00:00.000Z");
    expect(spring.end.toISOString()).toBe("2027-03-15T07:00:00.000Z");
    const autumn = localDayBoundsInTimezone(new Date("2027-11-07T18:00:00Z"), "America/Los_Angeles");
    expect(autumn.start.toISOString()).toBe("2027-11-07T07:00:00.000Z");
    expect(autumn.end.toISOString()).toBe("2027-11-08T08:00:00.000Z");
  });
  it("keeps independent school days for Sites in different timezones", () => {
    const at = new Date("2027-01-15T05:00:00Z");
    const pacific = localDayBoundsInTimezone(at, "America/Los_Angeles");
    const eastern = localDayBoundsInTimezone(at, "America/New_York");
    expect(pacific.start.toISOString()).toBe("2027-01-14T08:00:00.000Z");
    expect(eastern.start.toISOString()).toBe("2027-01-15T05:00:00.000Z");
  });
  it("uses the first real instant when daylight saving skips midnight", () => {
    const bounds=dateOnlyDayBoundsInTimezone("2018-11-04","America/Sao_Paulo");
    expect(bounds.start.toISOString()).toBe("2018-11-04T03:00:00.000Z");
    expect(dateTimeInputValue(bounds.start,"America/Sao_Paulo")).toBe("2018-11-04T01:00");
    expect(bounds.end.getTime()-bounds.start.getTime()).toBe(23*3_600_000);
  });
  it("starts an overlapping midnight at its earlier occurrence", () => {
    const bounds=dateOnlyDayBoundsInTimezone("2026-11-01","America/Havana");
    expect(bounds.start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(bounds.end.getTime()-bounds.start.getTime()).toBe(25*3_600_000);
  });
  it("rejects a completely skipped date rather than recording attendance on another day", () => {
    expect(()=>dateOnlyDayStartInTimezone("2011-12-30","Pacific/Apia")).toThrow("does not exist");
  });
  it("ends the preceding valid day at the first instant after a skipped date", () => {
    const bounds=dateOnlyDayBoundsInTimezone("2011-12-29","Pacific/Apia");
    expect(bounds.start.toISOString()).toBe("2011-12-29T10:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2011-12-30T10:00:00.000Z");
    expect(dateKeyInTimezone(bounds.end,"Pacific/Apia")).toBe("2011-12-31");
    expect(bounds.end.getTime()-bounds.start.getTime()).toBe(24*3_600_000);
    expect(()=>dateOnlyDayBoundsInTimezone("2011-12-30","Pacific/Apia")).toThrow("does not exist");
  });
  it("handles a half-hour DST day and a quarter-hour timezone", () => {
    const bounds=dateOnlyDayBoundsInTimezone("2026-10-04","Australia/Lord_Howe");
    expect(bounds.end.getTime()-bounds.start.getTime()).toBe(23.5*3_600_000);
    expect(dateOnlyDayStartInTimezone("2026-06-01","Asia/Kathmandu").toISOString()).toBe("2026-05-31T18:15:00.000Z");
  });
});

describe("date-only values and explicit timestamp display",()=>{
  it.each(["2027-02-29","2026-02-30","2026-00-01","2026-13-01","2026-1-01","", "2026-01-01T00:00:00Z"])(
    "rejects invalid date-only %s",value=>{
      expect(isValidDateOnly(value)).toBe(false);
      expect(()=>formatDateOnly(value)).toThrow();
      expect(()=>addCalendarDays(value,1)).toThrow();
      expect(()=>dateOnlyDayBoundsInTimezone(value,"UTC")).toThrow();
    });
  it("shifts calendar days rather than elapsed 24-hour periods",()=>{
    expect(isValidDateOnly("2028-02-29")).toBe(true);
    expect(addCalendarDays("2028-02-28",1)).toBe("2028-02-29");
    expect(addCalendarDays("2026-12-31",1)).toBe("2027-01-01");
    expect(addCalendarDays("2027-01-01",-1)).toBe("2026-12-31");
    expect(addCalendarDays("2026-11-01",1)).toBe("2026-11-02");
    expect(calendarWeekday("2026-11-01")).toBe(0);
    expect(()=>addCalendarDays("2026-11-01",1.5)).toThrow();
  });
  it("never shifts a date-only value but displays an instant in its resource timezone",()=>{
    const instant="2027-01-15T01:00:00Z";
    expect(formatDateOnly("2027-01-15")).toBe("Jan 15, 2027");
    expect(formatTimestamp(instant,"America/Los_Angeles",{dateStyle:"medium"})).toBe("Jan 14, 2027");
    expect(formatTimestamp(instant,"Asia/Tokyo",{dateStyle:"medium"})).toBe("Jan 15, 2027");
    expect(dateTimeInputValue(instant,"America/Los_Angeles")).toBe("2027-01-14T17:00");
    expect(dateTimeInputValue(instant,"Asia/Tokyo")).toBe("2027-01-15T10:00");
  });
  it.each(["not-a-date","2027-02-30T09:30:00Z","2027-01-15","2027-01-15T09:30","2027-01-15T24:00:00Z"])(
    "rejects invalid or offset-free timestamp %s",value=>{
      expect(()=>formatTimestamp(value,"UTC")).toThrow();
      expect(()=>dateTimeInputValue(value,"UTC")).toThrow();
    });
  it("rejects invalid Date instances, missing zones, and unsupported zones",()=>{
    expect(()=>dateKeyInTimezone(new Date(NaN),"UTC")).toThrow();
    for(const zone of ["","Mars/Base",undefined as never]){
      expect(isValidTimeZone(zone)).toBe(false);
      expect(()=>formatTimestamp("2027-01-15T00:00Z",zone)).toThrow();
      expect(()=>dateTimeInputInTimezone("2027-01-15T00:00",zone)).toThrow();
    }
  });
  it("handles years below 100 without the Date.UTC 1900 offset",()=>{
    expect(dateTimeInputInTimezone("0099-01-15T09:30","UTC")).toBe("0099-01-15T09:30:00.000Z");
  });
});

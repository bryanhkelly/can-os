import { dateOnlyDayBoundsInTimezone, dateTimeInputInTimezone } from "@/modules/calendar/timezone";

/** Due dates are the last minute of the Section's calendar day, not the
 * teacher's device or the server's timezone. Handles DST day lengths. */
export function assessmentDueAtForDate(date: string, timezone: string): string {
  const { end } = dateOnlyDayBoundsInTimezone(date, timezone);
  return new Date(end.getTime() - 60_000).toISOString();
}

/** A local release/close clock belongs to the Section. Ambiguous DST
 * overlap times are rejected so teachers can choose an unambiguous time. */
export function assessmentClockToUtc(value: string, timezone: string): string {
  return dateTimeInputInTimezone(value, timezone, "reject");
}

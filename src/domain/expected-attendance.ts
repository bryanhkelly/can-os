/**
 * GF4: calendar-and-schedule-derived attendance expectations.
 *
 * Attendance is an onsite fact, not an automatic consequence of a program
 * enrollment. Never infer "absent" from an unmarked day. A date must be on an
 * explicit active academic calendar, within the student's active school year,
 * and on an effective onsite instructional schedule to enter the denominator.
 */
export type AttendanceProgram = {
  id: string;
  organizationId: string;
  siteId: string | null;
  deliveryModel: { onsite?: boolean; onsiteDaysPerWeek?: number } | null;
};
export type AttendanceYear = {
  id: string;
  siteId: string;
  organizationId: string;
  programId: string | null;
  status: string;
  startsOn: string;
  endsOn: string;
};
export type AttendanceCalendar = {
  id: string;
  schoolYearId: string;
  siteId: string;
  active: boolean;
  version: number;
};
export type AttendanceCalendarDay = {
  academicCalendarId: string;
  calendarDate: string;
  type: string;
  instructionalMinutes: number | null;
};
export type AttendanceSchedule = {
  id: string;
  schoolYearId: string;
  siteId: string;
  programId: string | null;
  active: boolean;
  effectiveFrom: string;
  effectiveThrough: string | null;
};
export type AttendancePeriod = {
  scheduleTemplateId: string;
  dayOfWeek: number;
  type: string;
};
export type AttendanceEnrollment = {
  studentProfileId: string;
  programId: string | null;
  schoolYearId: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
};
export type AttendanceFact = {
  studentProfileId: string;
  programId: string;
  occurrenceKey: string;
  status: string;
};
export type ExpectedAttendanceSummary = {
  expectedDays: number;
  recordedExpectedDays: number;
  unmarkedExpectedDays: number;
  present: number;
  tardy: number;
  absent: number;
  excused: number;
  recordCompletionPercent: number | null;
  daysWithoutCalendarConfiguration: number;
  configuration: "configured" | "partial_calendar" | "missing_calendar" |
    "missing_schedule" | "onsite_pattern_mismatch" | "no_active_year" |
    "no_active_enrollments" | "not_onsite";
  windowStart: string;
  windowThrough: string;
};

const dayUTC = (value: string) => new Date(value + "T12:00:00.000Z");
const shiftDay = (value: string, days: number): string => {
  const date = dayUTC(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const weekday = (value: string) => dayUTC(value).getUTCDay();

/** Date-only comparisons remain in the site's timezone (including DST). */
export function siteDate(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return [get("year"), get("month"), get("day")].join("-");
}

export function summarizeExpectedOnsiteAttendance(input: {
  program: AttendanceProgram;
  years: readonly AttendanceYear[];
  calendars: readonly AttendanceCalendar[];
  calendarDays: readonly AttendanceCalendarDay[];
  schedules: readonly AttendanceSchedule[];
  periods: readonly AttendancePeriod[];
  enrollments: readonly AttendanceEnrollment[];
  effectiveFacts: readonly AttendanceFact[];
  timeZone: string;
  asOf: Date;
  windowDays?: number;
}): ExpectedAttendanceSummary {
  const through = shiftDay(siteDate(input.asOf, input.timeZone), -1);
  const start = shiftDay(through, -(Math.max(1, input.windowDays ?? 30) - 1));
  const base = {
    expectedDays: 0, recordedExpectedDays: 0, unmarkedExpectedDays: 0,
    present: 0, tardy: 0, absent: 0, excused: 0,
    recordCompletionPercent: null as number | null,
    daysWithoutCalendarConfiguration: 0,
    configuration: "configured" as ExpectedAttendanceSummary["configuration"],
    windowStart: start, windowThrough: through,
  };
  const program = input.program;
  if (!program.siteId || program.deliveryModel?.onsite !== true)
    return { ...base, configuration: "not_onsite" };

  const relevantYears = input.years.filter(y =>
    y.status === "active" && y.siteId === program.siteId &&
    y.organizationId === program.organizationId &&
    (!y.programId || y.programId === program.id) &&
    y.startsOn <= through && y.endsOn >= start);
  if (!relevantYears.length) return { ...base, configuration: "no_active_year" };

  // A program enrollment is tied to exactly one year. Never count a student
  // based on a different year's site-wide enrollment or an inactive enrollment.
  const studentRows = input.enrollments.filter(e =>
    e.programId === program.id && relevantYears.some(y => y.id === e.schoolYearId));
  if (!studentRows.length) return { ...base, configuration: "no_active_enrollments" };

  const facts = new Map(input.effectiveFacts.filter(f => f.programId === program.id)
    .map(f => [f.studentProfileId + ":" + f.occurrenceKey, f.status]));
  const daysByCalendar = new Map(input.calendarDays.map(d =>
    [d.academicCalendarId + ":" + d.calendarDate, d]));
  const periodsBySchedule = new Map<string, Set<number>>();
  for (const period of input.periods) {
    if (period.type !== "instruction") continue;
    if (!periodsBySchedule.has(period.scheduleTemplateId))
      periodsBySchedule.set(period.scheduleTemplateId, new Set());
    periodsBySchedule.get(period.scheduleTemplateId)!.add(period.dayOfWeek);
  }
  let calendarMissing = false;
  let scheduleMissing = false;
  let scheduleMismatch = false;
  let partialCalendar = false;
  const uniqueExpected = new Set<string>();

  for (const year of relevantYears) {
    const students = studentRows.filter(s => s.schoolYearId === year.id);
    if (!students.length) continue;
    const calendar = input.calendars
      .filter(c => c.schoolYearId === year.id && c.siteId === program.siteId && c.active)
      .sort((a, b) => b.version - a.version)[0];
    if (!calendar) { calendarMissing = true; continue; }

    for (let date = year.startsOn > start ? year.startsOn : start;
      date <= through && date <= year.endsOn; date = shiftDay(date, 1)) {
      const schedules = input.schedules
        .filter(s => s.schoolYearId === year.id && s.siteId === program.siteId &&
          s.active && (!s.programId || s.programId === program.id) &&
          s.effectiveFrom <= date && (!s.effectiveThrough || s.effectiveThrough >= date))
        .sort((a, b) =>
          Number(b.programId === program.id) - Number(a.programId === program.id) ||
          b.effectiveFrom.localeCompare(a.effectiveFrom));
      const chosen = schedules[0];
      if (!chosen) { scheduleMissing = true; continue; }
      const pattern = periodsBySchedule.get(chosen.id);
      if (!pattern?.size) { scheduleMissing = true; continue; }
      const onsiteDays = program.deliveryModel?.onsiteDaysPerWeek;
      if (typeof onsiteDays === "number" && onsiteDays > 0 && pattern.size > onsiteDays) {
        scheduleMismatch = true;
        continue;
      }
      if (!pattern.has(weekday(date))) continue;
      const configuredDay = daysByCalendar.get(calendar.id + ":" + date);
      if (!configuredDay) {
        partialCalendar = true;
        base.daysWithoutCalendarConfiguration += 1;
        continue;
      }
      if (configuredDay.type !== "instructional" && configuredDay.type !== "makeup" &&
        !(configuredDay.type === "special" && (configuredDay.instructionalMinutes ?? 0) > 0))
        continue;
      if (configuredDay.instructionalMinutes === 0) continue;

      for (const student of students) {
        if (student.startedAt && siteDate(student.startedAt, input.timeZone) > date) continue;
        if (student.endedAt && siteDate(student.endedAt, input.timeZone) <= date) continue;
        const key = student.studentProfileId + ":" + date + ":site-day";
        if (uniqueExpected.has(key)) continue;
        uniqueExpected.add(key);
        base.expectedDays += 1;
        const status = facts.get(key);
        if (!status || status === "expected") {
          base.unmarkedExpectedDays += 1;
        } else {
          base.recordedExpectedDays += 1;
          if (status === "present") base.present += 1;
          if (status === "tardy") base.tardy += 1;
          if (status === "absent") base.absent += 1;
          if (status === "excused") base.excused += 1;
        }
      }
    }
  }
  base.recordCompletionPercent = base.expectedDays > 0 ?
    Math.round(base.recordedExpectedDays / base.expectedDays * 10_000) / 100 : null;
  base.configuration = calendarMissing ? "missing_calendar" :
    scheduleMismatch ? "onsite_pattern_mismatch" :
    scheduleMissing ? "missing_schedule" :
    partialCalendar ? "partial_calendar" : "configured";
  return base;
}

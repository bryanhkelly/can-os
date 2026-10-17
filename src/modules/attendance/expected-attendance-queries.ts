import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import {
  academicCalendars, academicCalendarDays, enrollments, scheduleTemplatePeriods,
  scheduleTemplates, schoolYears, sites,
} from "@/db/schema";
import {
  summarizeExpectedOnsiteAttendance, type AttendanceFact, type AttendanceProgram,
  type ExpectedAttendanceSummary,
} from "@/domain/expected-attendance";

/**
 * GF4 scoped read projection. The caller must already have resolved the
 * programs from verified session grants. These queries never expand its set.
 * No attendance events are created by an expected-day calculation.
 */
export async function loadExpectedAttendanceCoverage(
  permittedPrograms: readonly AttendanceProgram[],
  effectiveFacts: readonly AttendanceFact[],
  asOf: Date,
  windowDays = 30,
  day?: { date: string; studentIds: Map<string, Set<string>> },
  expectedOccurrenceKeys?: Map<string, Set<string>>,
): Promise<Map<string, ExpectedAttendanceSummary>> {
  const results = new Map<string, ExpectedAttendanceSummary>();
  if (!permittedPrograms.length) return results;
  const siteIds = [...new Set(permittedPrograms.map(p => p.siteId)
    .filter((siteId): siteId is string => !!siteId))];
  const programIds = permittedPrograms.map(p => p.id);
  const minDate = day?.date ?? new Date(asOf.getTime() - (windowDays + 4) * 86400000)
    .toISOString().slice(0, 10);
  const maxDate = day?.date ?? asOf.toISOString().slice(0, 10);

  const [siteRows, yearRows, enrollmentRows] = await Promise.all([
    siteIds.length ? db.select({ id: sites.id, timezone: sites.timezone })
      .from(sites).where(inArray(sites.id, siteIds)) : Promise.resolve([]),
    siteIds.length ? db.select({
      id: schoolYears.id, siteId: schoolYears.siteId,
      organizationId: schoolYears.organizationId, programId: schoolYears.programId,
      status: schoolYears.status, startsOn: schoolYears.startsOn, endsOn: schoolYears.endsOn,
    }).from(schoolYears).where(and(inArray(schoolYears.siteId, siteIds),
      eq(schoolYears.status, "active"), lte(schoolYears.startsOn, maxDate),
      gte(schoolYears.endsOn, minDate))) : Promise.resolve([]),
    db.select({
      programId: enrollments.programId,
      studentProfileId: enrollments.studentProfileId,
      schoolYearId: enrollments.schoolYearId,
      startedAt: enrollments.startedAt, endedAt: enrollments.endedAt,
    }).from(enrollments).where(and(inArray(enrollments.programId, programIds),
      eq(enrollments.kind, "program"), eq(enrollments.status, "active"))),
  ]);
  const yearIds = yearRows.map(y => y.id);
  const [calendars, schedules] = await Promise.all([
    yearIds.length ? db.select({
      id: academicCalendars.id, schoolYearId: academicCalendars.schoolYearId,
      siteId: academicCalendars.siteId, active: academicCalendars.active,
      version: academicCalendars.version,
    }).from(academicCalendars).where(and(
      inArray(academicCalendars.schoolYearId, yearIds),
      eq(academicCalendars.active, true))) : Promise.resolve([]),
    yearIds.length ? db.select({
      id: scheduleTemplates.id, schoolYearId: scheduleTemplates.schoolYearId,
      siteId: scheduleTemplates.siteId, programId: scheduleTemplates.programId,
      active: scheduleTemplates.active, effectiveFrom: scheduleTemplates.effectiveFrom,
      effectiveThrough: scheduleTemplates.effectiveThrough,
    }).from(scheduleTemplates).where(and(
      inArray(scheduleTemplates.schoolYearId, yearIds),
      eq(scheduleTemplates.active, true))) : Promise.resolve([]),
  ]);
  const [calendarDays, periods] = await Promise.all([
    calendars.length ? db.select({
      academicCalendarId: academicCalendarDays.academicCalendarId,
      calendarDate: academicCalendarDays.calendarDate,
      type: academicCalendarDays.type,
      instructionalMinutes: academicCalendarDays.instructionalMinutes,
    }).from(academicCalendarDays).where(and(
      inArray(academicCalendarDays.academicCalendarId, calendars.map(c => c.id)),
      gte(academicCalendarDays.calendarDate, minDate),
      lte(academicCalendarDays.calendarDate, maxDate))) : Promise.resolve([]),
    schedules.length ? db.select({
      scheduleTemplateId: scheduleTemplatePeriods.scheduleTemplateId,
      dayOfWeek: scheduleTemplatePeriods.dayOfWeek,
      type: scheduleTemplatePeriods.type,
    }).from(scheduleTemplatePeriods).where(
      inArray(scheduleTemplatePeriods.scheduleTemplateId, schedules.map(s => s.id))) :
      Promise.resolve([]),
  ]);
  const timezones = new Map(siteRows.map(site => [site.id, site.timezone]));
  for (const program of permittedPrograms) {
    results.set(program.id, summarizeExpectedOnsiteAttendance({
      program, years: yearRows, calendars, calendarDays, schedules, periods,
      enrollments: enrollmentRows, effectiveFacts,
      timeZone: program.siteId ? timezones.get(program.siteId) ?? "UTC" : "UTC",
      asOf, windowDays,
      onDate: day?.date,
      onExpectedDay: day || expectedOccurrenceKeys ? (studentProfileId, date) => {
        if (day) {
          let ids = day.studentIds.get(program.id);
          if (!ids) { ids = new Set(); day.studentIds.set(program.id, ids); }
          ids.add(studentProfileId);
        }
        if (expectedOccurrenceKeys) {
          let keys = expectedOccurrenceKeys.get(program.id);
          if (!keys) {
            keys = new Set();
            expectedOccurrenceKeys.set(program.id, keys);
          }
          keys.add(studentProfileId + ":" + date + ":site-day");
        }
      } : undefined,
    }));
  }
  return results;
}

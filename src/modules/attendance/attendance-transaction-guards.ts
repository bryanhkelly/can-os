import { and, eq, inArray } from "drizzle-orm";
import type { db } from "@/db/client";
import {
  academicCalendars, academicCalendarDays, enrollments, programs,
  scheduleTemplatePeriods, scheduleTemplates, schoolYears, sections,
  sectionTeachers, sites, terms,
} from "@/db/schema";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import { assertOnsiteAttendanceScope, isOnsiteAttendanceRole } from "@/domain/onsite-attendance-access";
import type { AccessContext } from "@/domain/access-context";
import { siteDate, summarizeExpectedOnsiteAttendance } from "@/domain/expected-attendance";
import { lockAttendanceConfigurationAtSite } from "@/domain/attendance-configuration-lock";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Final school/roster entitlement inside recordAttendanceRevision's advisory-
 * locked transaction. The caller cannot invent a program, site or section.
 *
 * The caller has already acquired the attendance occurrence lock. We now
 * acquire the site's shared configuration advisory lock before loading any
 * eligibility source rows; academic-time mutations take the identical lock.
 * The row SHARE locks additionally protect the selected records themselves.
 * Enrollment mutations require their own coordination for new/removed rows.
 */
export async function assertExpectedOnsiteMarkInTransaction(
  tx: Transaction,
  context: CommandContext,
  input: {
    studentProfileId: string;
    programId: string;
    siteId: string | null;
    sectionId: string | null;
    date: string;
    occurrenceKey: string;
    expectedAt: Date;
  },
): Promise<void> {
  // CommandContext is the shared capability interface; the verified session
  // carries the active persona as an additional field.
  const role = (context as CommandContext & { role?: string }).role;
  const onsite = isOnsiteAttendanceRole(role ?? "");
  if (onsite) assertOnsiteAttendanceScope(context as AccessContext, input.siteId);
  if (input.occurrenceKey !== input.date + ":site-day" ||
      !input.siteId || !context.actorPersonId ||
      !(onsite || ["registrar", "teacher"].includes(role ?? "")) ||
      !context.scope.programIds?.includes(input.programId) ||
      !context.scope.siteIds?.includes(input.siteId))
    throw new AuthorizationError("attendance occurrence, staff and site scope");

  await lockAttendanceConfigurationAtSite(tx, input.siteId);

  const [program] = await tx.select({
    id: programs.id, organizationId: programs.organizationId,
    siteId: programs.siteId, deliveryModel: programs.deliveryModel,
  }).from(programs).where(eq(programs.id, input.programId)).for("share").limit(1);
  if (!program || !context.scope.organizationIds?.includes(program.organizationId) ||
      program.siteId !== input.siteId || program.deliveryModel.onsite !== true)
    throw new AuthorizationError("onsite program ownership");

  const [site] = await tx.select({
    timezone: sites.timezone, organizationId: sites.organizationId,
  }).from(sites).where(eq(sites.id, input.siteId)).for("share").limit(1);
  if (!site || site.organizationId !== program.organizationId ||
      siteDate(input.expectedAt, site.timezone) !== input.date ||
      input.date > siteDate(new Date(), site.timezone))
    throw new Error("Attendance date is not a valid current or historical school-local day");

  const enrollmentRows = await tx.select({
    studentProfileId: enrollments.studentProfileId,
    programId: enrollments.programId,
    schoolYearId: enrollments.schoolYearId,
    startedAt: enrollments.startedAt, endedAt: enrollments.endedAt,
  }).from(enrollments).where(and(
    eq(enrollments.kind, "program"),
    eq(enrollments.status, "active"),
    eq(enrollments.studentProfileId, input.studentProfileId),
    eq(enrollments.programId, input.programId),
  )).for("share");
  const yearIds = [...new Set(enrollmentRows.map(e => e.schoolYearId)
    .filter((id): id is string => !!id))];
  if (!yearIds.length) throw new AuthorizationError("active school-year enrollment");

  const years = await tx.select({
    id: schoolYears.id, siteId: schoolYears.siteId,
    organizationId: schoolYears.organizationId, programId: schoolYears.programId,
    status: schoolYears.status, startsOn: schoolYears.startsOn,
    endsOn: schoolYears.endsOn,
  }).from(schoolYears).where(and(
    inArray(schoolYears.id, yearIds),
    eq(schoolYears.status, "active"),
    eq(schoolYears.siteId, input.siteId),
    eq(schoolYears.organizationId, program.organizationId),
  )).for("share");
  const matchingYears = years.filter(y =>
    (y.programId === null || y.programId === input.programId) &&
    y.startsOn <= input.date && y.endsOn >= input.date);
  if (!matchingYears.length) throw new AuthorizationError("active school year at program site");

  // A confirmed Program enrollment without a classroom seat is not
  // authorization to mark a child physically present at a church-hosted CAN
  // school. Recheck inside this locked transaction for every actor role,
  // including registrars and site directors (not just facilitators).
  const { requiresIndependentChurchLocalDelegation } = await import(
    "@/modules/operations/site-local-delegation.server");
  const independentChurch=await requiresIndependentChurchLocalDelegation(tx,input.programId);
  if(independentChurch && !input.sectionId)
    throw new AuthorizationError("church school attendance requires enrolled instructional Section");

  if (input.sectionId || role === "teacher") {
    if (!input.sectionId) throw new AuthorizationError("teacher section assignment");
    const [section] = await tx.select({
      id: sections.id, active: sections.active, programId: sections.programId,
      siteId: sections.siteId, schoolYearId: terms.schoolYearId,
    }).from(sections).innerJoin(terms, eq(terms.id, sections.termId))
      .where(eq(sections.id, input.sectionId)).for("share").limit(1);
    if (!section || !section.active || section.programId !== input.programId ||
        section.siteId !== input.siteId ||
        !matchingYears.some(y => y.id === section.schoolYearId))
      throw new AuthorizationError("section not active in this student's school year");
    const [seat] = await tx.select({ id: enrollments.id }).from(enrollments)
      .where(and(
        eq(enrollments.kind, "section"), eq(enrollments.status, "active"),
        eq(enrollments.studentProfileId, input.studentProfileId),
        eq(enrollments.sectionId, input.sectionId),
        // Do not let an otherwise active but mis-keyed Section membership
        // stand in for attendance at a different Program or school year.
        eq(enrollments.programId, section.programId),
        eq(enrollments.schoolYearId, section.schoolYearId),
      )).for("share").limit(1);
    if (!seat) throw new AuthorizationError("student not assigned to section");
    if (role === "teacher") {
      const [teacher] = await tx.select({ id: sectionTeachers.id })
        .from(sectionTeachers).where(and(
          eq(sectionTeachers.sectionId, input.sectionId),
          eq(sectionTeachers.personId, context.actorPersonId),
        )).for("share").limit(1);
      if (!teacher) throw new AuthorizationError("verified section teacher assignment");
    }
  }

  const selectedYearIds = matchingYears.map(y => y.id);
  const calendars = await tx.select({
    id: academicCalendars.id, schoolYearId: academicCalendars.schoolYearId,
    siteId: academicCalendars.siteId, active: academicCalendars.active,
    version: academicCalendars.version,
  }).from(academicCalendars).where(and(
    inArray(academicCalendars.schoolYearId, selectedYearIds),
    eq(academicCalendars.siteId, input.siteId),
    eq(academicCalendars.active, true),
  )).for("share");
  if (!calendars.length) throw new Error("Active onsite instructional calendar is required");
  const calendarDays = await tx.select({
    academicCalendarId: academicCalendarDays.academicCalendarId,
    calendarDate: academicCalendarDays.calendarDate,
    type: academicCalendarDays.type,
    instructionalMinutes: academicCalendarDays.instructionalMinutes,
  }).from(academicCalendarDays).where(and(
    inArray(academicCalendarDays.academicCalendarId, calendars.map(c => c.id)),
    eq(academicCalendarDays.calendarDate, input.date),
  )).for("share");

  const schedules = await tx.select({
    id: scheduleTemplates.id, schoolYearId: scheduleTemplates.schoolYearId,
    siteId: scheduleTemplates.siteId, programId: scheduleTemplates.programId,
    active: scheduleTemplates.active, effectiveFrom: scheduleTemplates.effectiveFrom,
    effectiveThrough: scheduleTemplates.effectiveThrough,
  }).from(scheduleTemplates).where(and(
    inArray(scheduleTemplates.schoolYearId, selectedYearIds),
    eq(scheduleTemplates.siteId, input.siteId),
    eq(scheduleTemplates.active, true),
  )).for("share");
  if (!schedules.length) throw new Error("Active onsite instructional schedule is required");
  const periods = await tx.select({
    scheduleTemplateId: scheduleTemplatePeriods.scheduleTemplateId,
    dayOfWeek: scheduleTemplatePeriods.dayOfWeek,
    type: scheduleTemplatePeriods.type,
  }).from(scheduleTemplatePeriods).where(
    inArray(scheduleTemplatePeriods.scheduleTemplateId, schedules.map(s => s.id)),
  ).for("share");

  const expected = new Set<string>();
  const coverage = summarizeExpectedOnsiteAttendance({
    program, years: matchingYears, calendars, calendarDays, schedules, periods,
    enrollments: enrollmentRows, effectiveFacts: [],
    timeZone: site.timezone, asOf: new Date(), onDate: input.date,
    onExpectedDay: (studentId) => expected.add(studentId),
  });
  if (!expected.has(input.studentProfileId) || coverage.expectedDays === 0)
    throw new Error("Attendance day is not scheduled onsite for this student; " +
      "review academic calendar, schedule, and enrollment before marking");
}

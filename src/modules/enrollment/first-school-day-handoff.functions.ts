import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, gte, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { applications, programs, sites, academicCalendarDays, academicCalendars, schoolYears } from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { deriveFirstSchoolDayHandoff } from "@/domain/first-school-day-handoff";
import { siteDate } from "@/domain/expected-attendance";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { loadExpectedOnsiteRosterForActor } from "@/modules/attendance/onsite-attendance-workflow.functions";
import { loadOnsiteSupervisionPlanForActor } from "@/modules/operations/onsite-supervision.functions";

/**
 * The registrar's first-day checkpoint reuses the very same staff roster and
 * safety plan as Site Today. This is NOT a parallel enrollment, schedule,
 * supervision decision, or an authorization to mark attendance.
 */
export const getFirstSchoolDayHandoff = createServerFn({ method:"GET" })
  .validator((input:unknown) =>
    z.object({applicationId:z.string().uuid()}).strict().parse(input))
  .handler(async ({data}) => {
    setResponseHeader("Cache-Control","private, no-store");
    const actor = await getCommandContext(getRequest());
    if (actor.role !== "registrar" || !actor.actorPersonId || actor.demoFacilitator)
      throw new AuthorizationError("verified registrar first-day handoff");
    assertCapability(actor,"enrollment.activate");

    const [app] = await db.select({
      id:applications.id,stage:applications.stage,
      studentProfileId:applications.studentProfileId,
      programId:applications.programId,
      programStatus:programs.status,
      siteId:programs.siteId,
      organizationId:programs.organizationId,
      timezone:sites.timezone,
      onsite:programs.deliveryModel,
    }).from(applications)
      .innerJoin(programs,eq(programs.id,applications.programId))
      .innerJoin(sites,eq(sites.id,programs.siteId))
      .where(and(eq(applications.id,data.applicationId),
        eq(programs.siteId,sites.id),
        eq(programs.organizationId,sites.organizationId)))
      .limit(1);
    if (!app || !app.siteId ||
        !actor.scope.organizationIds?.includes(app.organizationId) ||
        !actor.scope.siteIds?.includes(app.siteId) ||
        !actor.scope.programIds?.includes(app.programId))
      throw new AuthorizationError("first-day student and original school scope");
    if (app.stage !== "accepted" || app.programStatus !== "active" ||
        app.onsite?.onsite !== true)
      throw new AuthorizationError("accepted student at active onsite school");

    // Derive the calendar date from the Site, not the user's browser clock.
    const today = siteDate(new Date(),app.timezone);
    // Preview an actual published calendar day, never invent a weekday schedule.
    const futureDays = await db.select({date:academicCalendarDays.calendarDate,
      type:academicCalendarDays.type}).from(academicCalendarDays)
      .innerJoin(academicCalendars,eq(academicCalendars.id,academicCalendarDays.academicCalendarId))
      .innerJoin(schoolYears,eq(schoolYears.id,academicCalendars.schoolYearId))
      .where(and(eq(academicCalendars.siteId,app.siteId),eq(academicCalendars.active,true),
        eq(schoolYears.programId,app.programId),eq(schoolYears.status,"active"),
        gte(academicCalendarDays.calendarDate,today)))
      .orderBy(asc(academicCalendarDays.calendarDate)).limit(366);
    const dates = [...new Set(futureDays.filter(day=>["instructional","special","makeup"].includes(day.type))
      .map(day=>day.date))];
    // Only today's roster may be observed by the live attendance reader.
    // A future published calendar day is a candidate, not a verified student day.
    const candidate = dates[0];
    const date = candidate ?? today;
    const preview = date > today;
    const roster = !preview && candidate
      ? await loadExpectedOnsiteRosterForActor(actor,{
          date,programId:app.programId,siteId:app.siteId,
        })
      : null;
    const programDay = roster?.programs.find(program=>program.id===app.programId);
    const matched = roster?.students.find(student=>
      student.studentProfileId===app.studentProfileId && student.programId===app.programId);

    // Never query a future supervision plan through the live-only reader.
    // Its preparation mode is restricted to site directors. A registrar-scoped
    // canonical preparation interface is required before claiming future readiness.
    const supervision = matched?.sectionId
      ? await loadOnsiteSupervisionPlanForActor(actor,{date,siteId:app.siteId})
      : null;
    const handoff = deriveFirstSchoolDayHandoff({
      programId:app.programId,
      studentProfileId:app.studentProfileId,
      configuration:programDay?.configuration ?? null,
      expectedDays:programDay?.expectedDays ?? 0,
      students:roster?.students ?? [],
      preparation:preview,
      blocks:supervision?.blocks ?? [],
      projectionTruncated:supervision?.projectionTruncated ?? false,
    });
    if (!candidate) return {
      date,preview:false,...handoff,state:"calendar_not_ready" as const,
      studentExpected:false,supervisionPlanned:false,attendanceRecorded:false,
      message:"No upcoming instructional calendar day was found. Review and publish the school-year calendar.",
    };
    if (preview) return {
      date,preview:true,...handoff,state:"not_on_roster" as const,
      studentExpected:false,supervisionPlanned:false,attendanceRecorded:false,
      outstandingGaps:["future_roster_verification_required"],
      message:"This is the next published instructional candidate, not a verified first day. Registrar-authorized future enrollment, Section, schedule and staffing verification is required.",
    };
    return {date,preview:false,...handoff};
  });

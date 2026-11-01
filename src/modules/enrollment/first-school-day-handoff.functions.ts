import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, gte, asc, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { applications, programs, sites, academicCalendarDays, academicCalendars, schoolYears, enrollments } from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { deriveFirstSchoolDayHandoff } from "@/domain/first-school-day-handoff";
import { planBoundedFirstDayCandidates } from "@/domain/first-school-day-candidates";
import { siteDate } from "@/domain/expected-attendance";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { loadExpectedOnsiteRosterForActor, loadExpectedFirstDayPreparationForActor } from "@/modules/attendance/onsite-attendance-workflow.functions";
import { loadOnsiteSupervisionPlanForActor, loadFirstDaySupervisionPreparationForActor } from "@/modules/operations/onsite-supervision.functions";

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
    // A school-local candidate is never evidence of attendance. Search only
    // the active institution/Program year and the latest published calendar.
    const futureDays = await db.select({date:academicCalendarDays.calendarDate,
      type:academicCalendarDays.type,
      minutes:academicCalendarDays.instructionalMinutes,
      version:academicCalendars.version,
      yearId:schoolYears.id,
      startsOn:schoolYears.startsOn,endsOn:schoolYears.endsOn,
    }).from(academicCalendarDays)
      .innerJoin(academicCalendars,eq(academicCalendars.id,academicCalendarDays.academicCalendarId))
      .innerJoin(schoolYears,eq(schoolYears.id,academicCalendars.schoolYearId))
      .where(and(eq(academicCalendars.siteId,app.siteId),eq(academicCalendars.active,true),
        eq(schoolYears.organizationId,app.organizationId),
        eq(schoolYears.siteId,app.siteId),
        eq(schoolYears.programId,app.programId),eq(schoolYears.status,"active"),
        gte(academicCalendarDays.calendarDate,today),
        gte(schoolYears.endsOn,today)))
      .orderBy(desc(academicCalendars.version),asc(academicCalendarDays.calendarDate)).limit(1464);
    // Use the latest active calendar version for each academic year; a stale
    // earlier version cannot re-open a canceled holiday or weekend.
    const versionByYear=new Map<string,number>();
    for(const day of futureDays){
      versionByYear.set(day.yearId,Math.max(versionByYear.get(day.yearId)??-1,day.version));
    }
    const dates=[...new Set(futureDays.filter(day=>
      day.version===versionByYear.get(day.yearId) &&
      day.date>=day.startsOn && day.date<=day.endsOn &&
      (day.type==="instructional"||day.type==="makeup"||
        (day.type==="special"&&(day.minutes??0)>0)) &&
      day.minutes!==0).map(day=>day.date))].sort();
    // One bounded query prefilters the next 180 published days by the student's
    // active Section-enrollment effective windows. This is ONLY a cost filter:
    // the canonical date-specific resolver remains the sole authority for
    // student/teacher/Section/schedule/onsite eligibility and identity.
    const placementWindows=await db.select({
      startedAt:enrollments.startedAt,endedAt:enrollments.endedAt,
    }).from(enrollments).where(and(
      eq(enrollments.studentProfileId,app.studentProfileId),
      eq(enrollments.programId,app.programId),
      eq(enrollments.kind,"section"),
      eq(enrollments.status,"active")));
    const scan=planBoundedFirstDayCandidates(dates,placementWindows,app.timezone);
    // Scan only bounded canonical days, never infer attendance from placement.
    // Dates beyond the budget are explicitly UNVERIFIED, not declared absent.
    let selected: Awaited<ReturnType<typeof loadExpectedFirstDayPreparationForActor>>|null=null;
    let selectedDate:string|null=null;
    let placementMissing=false;
    let missingCalendar=false;
    let noSchedule=false;
    let ambiguousPlacement=false;
    let teacherMissing=false;
    let selectedSupervision: Awaited<ReturnType<typeof loadFirstDaySupervisionPreparationForActor>>|null=null;
    let sectionScheduleMissing=false;
    for(const candidate of scan.candidates){
      const projected=await loadExpectedFirstDayPreparationForActor(actor,{
        date:candidate,programId:app.programId,siteId:app.siteId,
        studentProfileId:app.studentProfileId,
      });
      if(projected.program.configuration!=="configured"){
        if(projected.program.configuration.includes("calendar"))missingCalendar=true;
        else noSchedule=true;
        continue;
      }
      if(!projected.student){
        if(projected.unplaced)placementMissing=true;
        continue;
      }
      if(!projected.student.sectionId){placementMissing=true;continue;}
      if(new Set(projected.sectionMemberships.map(row=>row.sectionId)).size!==1){
        ambiguousPlacement=true;
        continue;
      }
      // Program-wide expected attendance is not enough: a student's Section
      // must itself have a real effective instructional timetable on this date.
      // This projection does not attest presence or authorize onsite opening.
      const sectionPlan=await loadFirstDaySupervisionPreparationForActor(actor,{
        date:candidate,siteId:app.siteId,programId:app.programId,
        sectionId:projected.student.sectionId,
      });
      if(!sectionPlan.blocks.some(block=>block.periodId!==null)){
        sectionScheduleMissing=true;
        continue;
      }
      selectedSupervision=sectionPlan;
      selected=projected;
      teacherMissing=!projected.qualifiedTeacherAssigned;
      selectedDate=candidate;
      break;
    }
    if(!selected || !selectedDate){
      const date=dates[0]??today;
      const blocker=scan.truncated?"verification_incomplete":missingCalendar?"calendar_not_ready":(placementMissing||ambiguousPlacement)?"placement_missing":
        (noSchedule||sectionScheduleMissing)?"not_scheduled":"not_on_roster";
      return {date,preview:date>today,state:blocker,studentExpected:false,
        supervisionPlanned:false,attendanceRecorded:false,
        outstandingGaps:[scan.truncated?"first_day_verification_limit_reached":missingCalendar?"calendar_unverified":ambiguousPlacement?
          "multiple_section_placements":placementMissing?
          "section_placement_missing":(noSchedule||sectionScheduleMissing)?"section_schedule_missing":"student_not_expected"],
        sectionTitle:null as string|null,programName:null as string|null,
        message:scan.truncated?"The preview reached its bounded 24-date verification limit without a provable first supervised day. This student is NOT cleared for attendance. Ask the registrar to review later enrollment dates, timetable and staffing; do not assume an absent roster or a ready school day.":
          !dates.length?"No published instructional day is available. Publish the school-year calendar.":
          ambiguousPlacement?"This student has multiple active Section placements on a scheduled day. Resolve the conflicting placements before opening.":
          placementMissing?"This student has no active instructional Section on a scheduled school day. Complete Section placement.":
          missingCalendar?"The published instructional calendar is incomplete. Correct the calendar and schedule.":
          (noSchedule||sectionScheduleMissing)?"No effective instructional timetable is available for this student. Configure the Section schedule.":
          "This student is not expected on any of the next 180 published instructional dates. Check enrollment effective dates and Section placement.",
      };
    }
    const date=selectedDate;
    const preview=date>today;
    const student=selected.student!;
    const live=!preview?await loadExpectedOnsiteRosterForActor(actor,{
      date,programId:app.programId,siteId:app.siteId,
    }):null;
    const onsite=preview
      ?selectedSupervision!
      :await loadOnsiteSupervisionPlanForActor(actor,{date,siteId:app.siteId});
    const handoff=deriveFirstSchoolDayHandoff({
      programId:app.programId,studentProfileId:app.studentProfileId,
      configuration:selected.program.configuration,
      expectedDays:selected.program.expectedDays,
      students:preview?[student]:live?.students??[],
      preparation:preview,
      blocks:onsite.blocks,projectionTruncated:onsite.projectionTruncated,
    });
    return {date,preview,...(teacherMissing ? {
      ...handoff,state:"supervision_unverified" as const,supervisionPlanned:false,
      outstandingGaps:[...handoff.outstandingGaps,"qualified_teacher_missing"],
      message:"This student is scheduled for the selected Section, but no currently verified academic-provider teacher assignment exists. Assign an authorized teacher before the first school day.",
    } : handoff),sectionTitle:student.sectionTitle,
      programName:selected.program.name};
  });

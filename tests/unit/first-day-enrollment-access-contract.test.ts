import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveFirstSchoolDayHandoff } from "../../src/domain/first-school-day-handoff";

const read = (path:string) =>
  readFileSync(new URL("../../"+path,import.meta.url),"utf8");

describe("Phase D live family-to-school handoff contracts",()=>{
  it("starts onsite readiness only from an authorized, accepted real application",()=>{
    const source=read("src/modules/enrollment/first-school-day-handoff.functions.ts");
    expect(source).toContain('actor.role !== "registrar"');
    expect(source).toContain('assertCapability(actor,"enrollment.activate")');
    expect(source).toContain('actor.scope.programIds?.includes(app.programId)');
    expect(source).toContain('app.stage !== "accepted"');
    expect(source).toContain('app.programStatus !== "active"');
    expect(source).toContain("siteDate(new Date(),app.timezone)");
  });
  it("uses canonical scheduled roster and real reviewed supervision rather than assuming presence",()=>{
    const source=read("src/modules/enrollment/first-school-day-handoff.functions.ts");
    expect(source).toContain("loadExpectedOnsiteRosterForActor");
    expect(source).toContain("loadOnsiteSupervisionPlanForActor");
    expect(source).toContain('studentProfileId:app.studentProfileId');
    expect(source).toContain("deriveFirstSchoolDayHandoff");
    expect(source).not.toContain("insert(attendanceEvents)");
    expect(source).not.toContain("recordAttendanceRevision");
  });
  it("never reads a future attendance roster or future staffing as observed presence",()=>{
    const source=read("src/modules/enrollment/first-school-day-handoff.functions.ts");
    expect(source).toContain("const preview=date>today");
    expect(source).toContain("loadExpectedFirstDayPreparationForActor");
    expect(source).toContain("loadFirstDaySupervisionPreparationForActor");
    expect(source).toContain("qualified_teacher_missing");
    expect(source).toContain("multiple_section_placements");
    expect(source).toContain("versionByYear");
    expect(source).toContain("day.minutes!==0");
    expect(source).toContain("sectionScheduleMissing");
    expect(source).toContain('studentProfileId:app.studentProfileId');
    expect(source).not.toContain("insert(attendanceEvents)");
    expect(source).not.toContain("markExpectedOnsiteAttendance");
  });
  it("uses only registrar scoped canonical future preparation, never future attendance events",()=>{
    const attendance=read("src/modules/attendance/onsite-attendance-workflow.functions.ts");
    const future=attendance.slice(attendance.indexOf("export const loadExpectedFirstDayPreparationForActor="),
      attendance.indexOf("export const loadExpectedSchoolDayPreparation="));
    expect(future).toContain('actor.role!=="registrar"');
    expect(future).toContain('assertCapability(actor,"enrollment.activate")');
    expect(future).toContain('resolveExpectedRoster(actor,data.date,data.programId,data.studentProfileId,data.siteId,true)');
    expect(future).not.toContain("attendanceEvents");
    expect(future).toContain("qualifiedTeacherAssigned");
    expect(future).toContain('eq(accountPersonGrants.role,"teacher")');
    expect(future).toContain("program.academicProviderOrganizationId");
    expect(attendance).toContain("lte(terms.startsOn,date),gte(terms.endsOn,date)");
    expect(attendance).toContain("effectiveSections=sectionsAtSite.filter");
    expect(attendance).toContain("programStartsAt:activeProgramEnrollment.startedAt");
    expect(attendance).toContain("programEndsAt:activeProgramEnrollment.endedAt");
    expect(future).not.toContain("recordAttendanceRevision");
    const staffing=read("src/modules/operations/onsite-supervision.functions.ts");
    expect(staffing).toContain("loadFirstDaySupervisionPreparationForActor");
    expect(staffing).toContain('registrarFirstDay:true');
    expect(staffing).toContain('eq(sections.programId,data.programId!)');
    expect(staffing).toContain("sectionsAtSite.some(row=>row.id===data.sectionId)");
    expect(staffing).toContain("plan.blocks.filter(block=>block.programId===data.programId");
  });
  it("keeps active student grants distinct from historic approved guardian consent",()=>{
    const service=read("src/modules/enrollment/student-access-handoff.functions.ts");
    const statusRead=service.slice(
      service.indexOf("export const getStudentLearningHandoff="),
      service.indexOf("export const provisionStudentLearningAccess="));
    expect(statusRead).toContain('consent?.status==="approved"');
    expect(statusRead).toContain('eq(accountPersonGrants.active,true)');
    expect(statusRead).toContain('eq(accessAccounts.disabled,false)');
    expect(statusRead).toContain('eq(accountPersonGrants.role,"student")');
    expect(statusRead).not.toContain('accountPersonGrants.isSynthetic');
    expect(statusRead).toContain('status:"access_unavailable"');
    const ui=read("src/components/enrollment/StudentLearningAccessHandoff.tsx");
    expect(ui).toContain('status==="access_unavailable"');
    expect(ui).toContain("A sign-in link");
    expect(ui).toContain("cannot restore a revoked grant");
  });
  it("keeps the live first-day checkpoint connected to the admissions workspace",()=>{
    const admissions=read("src/routes/admissions.index.tsx");
    expect(admissions).toContain("FirstSchoolDayHandoff");
    expect(admissions).toContain("StudentLearningAccessHandoff");
    expect(admissions).toContain("Review revoked student access");
    const handoff=read("src/components/enrollment/FirstSchoolDayHandoff.tsx");
    expect(handoff).toContain("the Program's official attendance roster");
    expect(handoff).toContain('to="/site/day"');
    expect(handoff).toContain("not opening authorization");
  });
});


describe("future first-day readiness is not physical attendance",()=>{
  const base={programId:"program",studentProfileId:"student",configuration:"configured",
    expectedDays:1,students:[{studentProfileId:"student",programId:"program",
      sectionId:"section",status:"present"}],blocks:[{programId:"program",
      sectionId:"section",periodId:"period",assignedPlan:true,gaps:[]}],
    projectionTruncated:false};
  it("does not accept a future present status as attendance",()=>{
    const result=deriveFirstSchoolDayHandoff({...base,preparation:true});
    expect(result.state).toBe("staffing_plan_ready");
    expect(result.attendanceRecorded).toBe(false);
    expect(result.supervisionPlanned).toBe(true);
  });
  it("recognizes actual same-day recorded attendance separately",()=>{
    const result=deriveFirstSchoolDayHandoff({...base,preparation:false});
    expect(result.state).toBe("attendance_recorded");
    expect(result.attendanceRecorded).toBe(true);
  });
  it("fails closed for a missing or different student's Section",()=>{
    expect(deriveFirstSchoolDayHandoff({...base,students:[],preparation:true}).state)
      .toBe("not_on_roster");
    expect(deriveFirstSchoolDayHandoff({...base,students:[{...base.students[0],sectionId:null}],
      preparation:true}).state).toBe("placement_missing");
    expect(deriveFirstSchoolDayHandoff({...base,blocks:[{...base.blocks[0],sectionId:"other"}],
      preparation:true}).state).toBe("supervision_unverified");
  });
  it("fails closed on calendar, timetable, absent plan, stale staffing or truncated evidence",()=>{
    expect(deriveFirstSchoolDayHandoff({...base,configuration:"missing_calendar",preparation:true}).state)
      .toBe("calendar_not_ready");
    expect(deriveFirstSchoolDayHandoff({...base,expectedDays:0,preparation:true}).state)
      .toBe("not_scheduled");
    expect(deriveFirstSchoolDayHandoff({...base,blocks:[],preparation:true}).state)
      .toBe("supervision_unverified");
    expect(deriveFirstSchoolDayHandoff({...base,blocks:[{...base.blocks[0],
      gaps:["facilitator_grant_revoked"]}],preparation:true}).supervisionPlanned).toBe(false);
    expect(deriveFirstSchoolDayHandoff({...base,projectionTruncated:true,
      preparation:true}).supervisionPlanned).toBe(false);
  });
});

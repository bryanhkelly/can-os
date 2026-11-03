import {describe,expect,it} from "vitest";
import {
  projectPublicSchoolDay,publicSchoolDayScheduleSignature,
  competingActiveSchoolDaySchedules,isIndependentPublicScheduleReviewer,
  type PublicScheduleApprovalScope,
} from "@/domain/public-school-day";

const scope:PublicScheduleApprovalScope={
  siteId:"school-site",programId:"elementary",schoolYearId:"year-2026",
  scheduleTemplateId:"template-a",siteTimezone:"America/Los_Angeles",
  schoolYearTimezone:"America/Los_Angeles",
  schoolYearStartsOn:"2026-08-01",schoolYearEndsOn:"2027-06-30",
  effectiveFrom:"2026-08-01",effectiveThrough:null,
  schoolYearKey:"2026-2027",schoolYearName:"2026-2027 School Year",
  gradeRange:{min:"K",max:"5"},programType:"academic",
  siteRevision:"2026-09-01T00:00:00Z",
  programRevision:"2026-09-01T00:00:00Z",
  yearRevision:"2026-09-01T00:00:00Z",
  templateRevision:"2026-10-01T00:00:00Z",
};
const now=new Date("2026-11-03T18:00:00Z");
const sunday=[{dayOfWeek:0,startsAtLocal:"10:00",endsAtLocal:"12:00",
  type:"instruction",sequence:1,label:"Sunday enrichment"}];
function approved(periods= sunday,reviewScope=scope){
  return {schoolYearStatus:"active",templateActive:true,
    programMatches:true,siteMatches:true,timezoneMatches:true,
    startsOn:"2026-08-01",endsOn:"2027-06-30",
    effectiveFrom:"2026-08-01",effectiveThrough:null,
    periods,reviewScope,
    approval:{status:"approved" as const,revision:3,
      reviewedByPersonId:"publisher",
      reviewedAt:"2026-10-01T00:00:00Z",
      signature:publicSchoolDayScheduleSignature(periods,reviewScope)},
  };
}
describe("v2 versioned, Program-specific public weekly schedules",()=>{
  it("preserves Sunday and Saturday even for weekend-only enrichment",()=>{
    const weekend=[...sunday,{...sunday[0]!,dayOfWeek:6,label:"Saturday studio"}];
    const result=projectPublicSchoolDay([approved(weekend)],scope.siteTimezone,now);
    expect(result.state).toBe("approved");
    expect(result.weeklyPattern.map(x=>x.dayOfWeek)).toEqual([0,6]);
    expect(result.approvedPatternSource?.scope.schoolYearId).toBe("year-2026");
  });
  it("preserves differing Tuesday and Friday times without fictitious uniform hours",()=>{
    const periods=[
      {...sunday[0]!,dayOfWeek:2,startsAtLocal:"08:00",endsAtLocal:"13:00"},
      {...sunday[0]!,dayOfWeek:5,startsAtLocal:"10:00",endsAtLocal:"15:00"},
    ];
    const result=projectPublicSchoolDay([approved(periods)],scope.siteTimezone,now);
    expect(result.state).toBe("pending");
    expect(result.weeklyPatternState).toBe("approved");
    expect(result.days.canDisplay).toBe(false);
    expect(result.weeklyPattern.map(x=>x.dayOfWeek)).toEqual([2,5]);
    expect(result.approvedPatternSource?.instructionalIntervals).toHaveLength(2);
  });
  it("rejects approval from a previous year, Program, Site, address or version",()=>{
    const initial=approved();
    for(const changed of [
      {...scope,schoolYearId:"year-2027"},
      {...scope,programId:"high-school"},
      {...scope,siteId:"other-site"},
      {...scope,siteRevision:"2026-11-02T00:00:00Z"},
      {...scope,programRevision:"2026-11-02T00:00:00Z"},
      {...scope,yearRevision:"2026-11-02T00:00:00Z"},
      {...scope,templateRevision:"2026-11-02T00:00:00Z"},
      {...scope,siteTimezone:"America/New_York"},
    ]){
      const changedAfterReview={...initial,reviewScope:changed};
      expect(projectPublicSchoolDay([changedAfterReview],scope.siteTimezone,now).weeklyPattern)
        .toHaveLength(0);
    }
  });
  it("rejects changed periods, inactive years, overlaps and wrong Site/Program flags",()=>{
    const first=approved();
    const changed={...first,periods:[{...sunday[0],endsAtLocal:"13:00"}]};
    const variants=[
      [changed],[{...first,schoolYearStatus:"draft"}],
      [first,approved()],[{...first,timezoneMatches:false}],
      [{...first,siteMatches:false}],[{...first,programMatches:false}],
      [{...first,approval:null}],
    ];
    for(const pair of variants)
      expect(projectPublicSchoolDay(pair,scope.siteTimezone,now).weeklyPatternState)
        .toBe("pending");
  });
  it("rejects a second active timetable even when it is unapproved",()=>{
    const approvedOne=approved();
    expect(projectPublicSchoolDay([approvedOne,{
      ...approvedOne,approval:null,
    }],scope.siteTimezone,now).weeklyPatternState).toBe("pending");
    const overlapping=[{
      schoolYearStatus:"active",templateActive:true,
      programMatches:true,siteMatches:true,
      startsOn:"2026-08-01",endsOn:"2027-06-30",
      effectiveFrom:"2026-08-01",effectiveThrough:null,
    },{
      schoolYearStatus:"active",templateActive:true,
      programMatches:true,siteMatches:true,
      startsOn:"2026-08-01",endsOn:"2027-06-30",
      effectiveFrom:"2026-11-01",effectiveThrough:"2026-11-10",
    }];
    expect(competingActiveSchoolDaySchedules(overlapping,{
      schoolYearStartsOn:"2026-08-01",schoolYearEndsOn:"2027-06-30",
      effectiveFrom:"2026-08-01",effectiveThrough:null,
    })).toBe(true);
    expect(competingActiveSchoolDaySchedules(overlapping.map((item,index)=>
      index===1?{...item,effectiveFrom:"2027-07-01"}:item),{
        schoolYearStartsOn:"2026-08-01",schoolYearEndsOn:"2027-06-30",
        effectiveFrom:"2026-08-01",effectiveThrough:null,
      })).toBe(false);
  });
  it("requires an independent academic schedule reviewer",()=>{
    expect(isIndependentPublicScheduleReviewer("publisher","editor")).toBe(true);
    expect(isIndependentPublicScheduleReviewer("editor","editor")).toBe(false);
    expect(isIndependentPublicScheduleReviewer(null,"editor")).toBe(false);
    expect(isIndependentPublicScheduleReviewer("publisher",null)).toBe(false);
  });
  it("shows split-day teaching intervals rather than inventing uninterrupted instruction",()=>{
    const split=[
      {...sunday[0]!,dayOfWeek:0,startsAtLocal:"09:00",endsAtLocal:"11:00"},
      {...sunday[0]!,dayOfWeek:0,startsAtLocal:"13:00",endsAtLocal:"15:00",sequence:2},
    ];
    const shown=projectPublicSchoolDay([approved(split)],scope.siteTimezone,now);
    expect(shown.weeklyPatternState).toBe("approved");
    expect(shown.state).toBe("pending");
    expect(shown.weeklyPattern).toEqual([
      {dayOfWeek:0,startsAtLocal:"09:00",endsAtLocal:"11:00",timezone:scope.siteTimezone},
      {dayOfWeek:0,startsAtLocal:"13:00",endsAtLocal:"15:00",timezone:scope.siteTimezone},
    ]);
    expect(shown.days.canDisplay).toBe(false);
    const overlapping=[...split,{...split[1]!,startsAtLocal:"10:00"}];
    expect(projectPublicSchoolDay([approved(overlapping)],scope.siteTimezone,now)
      .weeklyPatternState).toBe("pending");
  });
  it("does not mistake a reviewed template for holiday-specific attendance",()=>{
    const result=projectPublicSchoolDay([approved()],scope.siteTimezone,now);
    expect(result.approvedPatternSource?.patternKind)
      .toBe("standard_weekly_template_not_holiday_calendar");
    expect(result.approvedPatternSource?.approval.revision).toBe(3);
  });
});

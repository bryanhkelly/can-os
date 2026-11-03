import {describe,expect,it} from "vitest";
import {
  projectPublicSchoolDay,publicSchoolDayScheduleSignature,
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
    const weekend=[...sunday,{...sunday,dayOfWeek:6,label:"Saturday studio"}];
    const result=projectPublicSchoolDay([approved(weekend)],scope.siteTimezone,now);
    expect(result.state).toBe("approved");
    expect(result.weeklyPattern.map(x=>x.dayOfWeek)).toEqual([0,6]);
    expect(result.approvedPatternSource?.scope.schoolYearId).toBe("year-2026");
  });
  it("preserves differing Tuesday and Friday times without fictitious uniform hours",()=>{
    const periods=[
      {...sunday,dayOfWeek:2,startsAtLocal:"08:00",endsAtLocal:"13:00"},
      {...sunday,dayOfWeek:5,startsAtLocal:"10:00",endsAtLocal:"15:00"},
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
  it("does not mistake a reviewed template for holiday-specific attendance",()=>{
    const result=projectPublicSchoolDay([approved()],scope.siteTimezone,now);
    expect(result.approvedPatternSource?.patternKind)
      .toBe("standard_weekly_template_not_holiday_calendar");
    expect(result.approvedPatternSource?.approval.revision).toBe(3);
  });
});

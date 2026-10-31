import { describe, expect, it } from "vitest";
import { deriveFirstSchoolDayHandoff } from "@/domain/first-school-day-handoff";

const programId="p1", studentProfileId="child1", sectionId="section1";
function assess(overrides:Partial<Parameters<typeof deriveFirstSchoolDayHandoff>[0]>={}){
  return deriveFirstSchoolDayHandoff({
    programId,studentProfileId,configuration:"configured",expectedDays:1,
    students:[{programId,studentProfileId,sectionId,status:"unmarked"}],
    blocks:[{programId,sectionId,periodId:"first-period",
      assignedPlan:true,gaps:[]}],
    projectionTruncated:false,
    ...overrides,
  });
}
describe("Phase D first onsite school-day handoff",()=>{
  it("does not count an enrollment or class as expected attendance when the calendar is missing",()=>{
    const view=assess({configuration:"missing_calendar"});
    expect(view).toMatchObject({state:"calendar_not_ready",studentExpected:false,
      supervisionPlanned:false,attendanceRecorded:false});
  });
  it("does not create attendance on a holiday or day without an onsite schedule",()=>{
    const view=assess({expectedDays:0});
    expect(view).toMatchObject({state:"not_scheduled",studentExpected:false,
      attendanceRecorded:false});
  });
  it("must match the exact student's authorized Program roster",()=>{
    const anotherStudent=assess({students:[{programId,studentProfileId:"another-child",
      sectionId,status:"present"}]});
    const anotherProgram=assess({students:[{programId:"elsewhere",studentProfileId,
      sectionId,status:"present"}]});
    for(const view of [anotherStudent,anotherProgram])
      expect(view).toMatchObject({state:"not_on_roster",studentExpected:false,
        attendanceRecorded:false,supervisionPlanned:false});
  });
  it("requires a named Section even for a student included on a legacy program-only roster",()=>{
    expect(assess({students:[{programId,studentProfileId,sectionId:null,
      status:"unmarked"}]})).toMatchObject({state:"placement_missing",
      studentExpected:true,supervisionPlanned:false});
  });
  it("fails closed for truncated staffing projections, missing blocks and safeguarding gaps",()=>{
    const tests=[
      assess({projectionTruncated:true}),
      assess({blocks:[]}),
      assess({blocks:[{programId,sectionId,periodId:"first-period",
        assignedPlan:false,gaps:["child_safety_screening_missing"]}]}),
      assess({blocks:[{programId,sectionId,periodId:null,
        assignedPlan:false,gaps:["schedule_missing"]}]}),
    ];
    for(const view of tests)
      expect(view).toMatchObject({state:"supervision_unverified",
        studentExpected:true,supervisionPlanned:false,attendanceRecorded:false});
    expect(tests[2]!.outstandingGaps).toContain("child_safety_screening_missing");
    expect(tests[0]!.outstandingGaps).toContain("projection_incomplete");
    expect(tests[1]!.outstandingGaps).toContain("scheduled_supervision_missing");
  });
  it("does not confuse planned coverage with observed physical attendance",()=>{
    expect(assess()).toMatchObject({
      state:"staffing_plan_ready",studentExpected:true,
      supervisionPlanned:true,attendanceRecorded:false,
    });
  });
  it("records only real observed attendance statuses; expected is not a mark",()=>{
    for(const status of ["present","tardy","absent","excused"]){
      expect(assess({students:[{programId,studentProfileId,sectionId,status}]}))
        .toMatchObject({state:"attendance_recorded",attendanceRecorded:true});
    }
    expect(assess({students:[{programId,studentProfileId,sectionId,
      status:"expected"}]})).toMatchObject({state:"staffing_plan_ready",
      attendanceRecorded:false});
  });
  it("rejects mismatched Section staffing plans instead of borrowing another class's coverage",()=>{
    expect(assess({blocks:[{programId,sectionId:"other-section",
      periodId:"period",assignedPlan:true,gaps:[]}]}))
      .toMatchObject({state:"supervision_unverified",
        supervisionPlanned:false});
  });
});

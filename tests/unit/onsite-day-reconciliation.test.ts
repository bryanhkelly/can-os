import { describe,expect,it } from "vitest";
import { deriveOnsiteDayReconciliation } from "@/domain/onsite-day-reconciliation";

const programs=[{id:"school",name:"CAN Academy",configuration:"configured",
  expectedDays:1,missingCalendarDates:0}];
const mark=(studentProfileId:string,status:string,attendanceEventId:string|null)=>({
  studentProfileId,programId:"school",studentName:studentProfileId,
  status,attendanceEventId,
});

describe("Hybrid site daily attendance reconciliation",()=>{
  it("requires actual recorded marks for every scheduled student-program entry",()=>{
    const result=deriveOnsiteDayReconciliation(programs,[
      mark("student-a","present","mark-a"),
      mark("student-b","tardy","mark-b"),
      mark("student-c","absent","mark-c"),
    ]);
    expect(result).toMatchObject({
      readyForAttendanceReview:true,expectedEntries:3,
      markedEntries:3,unrecordedEntries:0,distinctStudentCount:3,
      issues:[],
    });
    expect(result.note).toMatch(/not.*close official attendance/i);
  });
  it("does not infer an absence or success from an unrecorded entry",()=>{
    const result=deriveOnsiteDayReconciliation(programs,[
      mark("student-a","present","mark-a"),
      mark("student-b","unmarked",null),
    ]);
    expect(result.readyForAttendanceReview).toBe(false);
    expect(result.unrecordedEntries).toBe(1);
    expect(result.markedEntries).toBe(1);
    expect(result.issues).toEqual([expect.objectContaining({
      kind:"unrecorded",studentProfileId:"student-b",
    })]);
  });
  it("blocks ambiguous or contradictory marks and duplicate roster entries",()=>{
    const result=deriveOnsiteDayReconciliation(programs,[
      mark("student-a","present",null),
      mark("student-b","unmarked","mark-b"),
      mark("student-c","excused","mark-c"),
      mark("student-c","excused","mark-c-again"),
    ]);
    expect(result.readyForAttendanceReview).toBe(false);
    expect(result.markedEntries).toBe(1);
    expect(result.issues.map(x=>x.kind).sort()).toEqual([
      "duplicate","invalid_record","invalid_record",
    ]);
  });
  it("blocks incomplete site calendars and never treats empty rosters as a closed school day",()=>{
    const broken=deriveOnsiteDayReconciliation([
      {...programs[0]!,configuration:"missing_calendar",expectedDays:0,
        missingCalendarDates:1},
    ],[mark("student-a","present","mark-a")]);
    expect(broken.readyForAttendanceReview).toBe(false);
    expect(broken.issues[0]?.kind).toBe("configuration");
    for(const [ps,entries] of [[[],[]],[programs,[]]] as const){
      const result=deriveOnsiteDayReconciliation(ps,entries);
      expect(result.readyForAttendanceReview).toBe(false);
    }
  });
  it("separates program attendance entries from physical student headcount",()=>{
    const result=deriveOnsiteDayReconciliation([
      ...programs,{...programs[0]!,id:"enrichment",name:"Afternoon Enrichment"},
    ],[
      mark("same-student","present","mark-1"),
      {...mark("same-student","tardy","mark-2"),programId:"enrichment"},
    ]);
    expect(result.expectedEntries).toBe(2);
    expect(result.distinctStudentCount).toBe(1);
    expect(result.readyForAttendanceReview).toBe(true);
  });
});

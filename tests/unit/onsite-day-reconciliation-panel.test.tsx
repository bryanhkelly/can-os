import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OnsiteDayReconciliationPanel } from "@/components/operations/OnsiteDayReconciliationPanel";

vi.mock("@/modules/operations/onsite-day-review.functions",()=>({
  getOnsiteDayReview:vi.fn(),
  attestOnsiteDayReview:vi.fn(),
}));

const roster = {
  date:"2026-10-22",
  programs:[{id:"program-1",name:"CAN Site",configuration:"configured" as const,
    expectedDays:1,missingCalendarDates:0}],
  students:[
    {studentProfileId:"student-1",programId:"program-1",
      programName:"CAN Site",studentName:"Student One",
      sectionTitle:null,occurrenceKey:"2026-10-22:site-day",
      attendanceEventId:"event-1",status:"present" as const},
    {studentProfileId:"student-2",programId:"program-1",
      programName:"CAN Site",studentName:"Student Two",
      sectionTitle:null,occurrenceKey:"2026-10-22:site-day",
      attendanceEventId:null,status:"unmarked" as const},
  ],
};

describe("site day attendance reconciliation panel",()=>{
  it("surfaces missing observation as unresolved, not auto-absence or closure",()=>{
    const html=renderToStaticMarkup(
      <OnsiteDayReconciliationPanel date="2026-10-22" roster={roster}/>);
    expect(html).toContain("Daily attendance reconciliation");
    expect(html).toContain("Student Two");
    expect(html).toContain("no onsite attendance observation recorded");
    expect(html).toContain("Missing marks remain unrecorded");
    expect(html).toContain("Attendance review is not ready: 1 unresolved attendance or configuration issues");
    expect(html).toContain("Review-ready means only that every scheduled student-program entry has a recorded attendance mark");
    expect(html).toContain("does not close official attendance");
    expect(html).not.toContain("Attendance automatically closed");
    expect(html).not.toContain("Student Two — absent");
  });
  it("distinguishes two program entries from a single actual headcount",()=>{
    const html=renderToStaticMarkup(
      <OnsiteDayReconciliationPanel date="2026-10-22" roster={{
        ...roster,students:[{...roster.students[0]!,status:"present" as const}],
      }}/>);
    expect(html).toContain("1 distinct students");
    expect(html).toContain("program-attendance entries");
  });
});

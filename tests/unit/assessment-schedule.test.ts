import { describe, expect, it } from "vitest";
import { assertAssessmentSchedule } from "@/domain/assessment-schedule";
import { assessmentAvailability } from "@/domain/assessment-availability";
const release=new Date("2026-11-01T08:00:00Z"),due=new Date("2026-11-02T08:00:00Z"),close=new Date("2026-11-03T08:00:00Z");
describe("assessment schedule",()=>{
  it("keeps overdue work available until its distinct close time",()=>{
    assertAssessmentSchedule({availableAt:release,dueAt:due,closesAt:close});
    expect(assessmentAvailability({status:"published",availableAt:release,closesAt:close},new Date("2026-11-02T12:00:00Z")).actionable).toBe(true);
    expect(assessmentAvailability({status:"published",availableAt:release,closesAt:close},close).actionable).toBe(false);
  });
  it("permits no closure or closure at the due time",()=>{
    expect(()=>assertAssessmentSchedule({availableAt:release,dueAt:due,closesAt:null})).not.toThrow();
    expect(()=>assertAssessmentSchedule({availableAt:release,dueAt:due,closesAt:due})).not.toThrow();
  });
  it.each([
    {availableAt:close,dueAt:due,closesAt:null},
    {availableAt:release,dueAt:due,closesAt:release},
    {availableAt:release,dueAt:null,closesAt:release},
    {availableAt:null,dueAt:new Date("invalid"),closesAt:null},
  ])("rejects contradictory dates before persistence",input=>expect(()=>assertAssessmentSchedule(input)).toThrow());
});

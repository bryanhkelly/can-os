import {describe,expect,it} from "vitest";
import {createAssessmentStatus} from "@/domain/assessment-publication";

describe("explicit assessment publication",()=>{
 const due=new Date("2027-02-03T23:59:00Z");
 it("does not publish a due-dated draft",()=>{
  expect(createAssessmentStatus(false,due)).toBe("draft");
  expect(createAssessmentStatus(false,null)).toBe("draft");
 });
 it("requires both teacher publication intent and a due date",()=>{
  expect(createAssessmentStatus(true,due)).toBe("published");
  expect(()=>createAssessmentStatus(true,null)).toThrow(/due date/i);
 });
});

import { describe, expect, it } from "vitest";
import { guardianFeedbackReleased, latestGuardianAttempts, guardianAssignmentSummary } from "@/domain/guardian-academics";

describe("guardian assignment release policy", () => {
 it("never exposes grades for drafts or submitted work", () => {
  for (const status of [null,"assigned","submitted","in_progress","unknown"])
   expect(guardianFeedbackReleased(status)).toBe(false);
 });
 it("shows only teacher-released grades and feedback", () => {
  expect(guardianFeedbackReleased("graded")).toBe(true);
  expect(guardianFeedbackReleased("returned")).toBe(true);
 });
 it("selects the latest attempt for each assignment", () => {
  const attempts=[
   {assessmentId:"a",attemptNumber:1,status:"returned"},
   {assessmentId:"b",attemptNumber:1,status:"submitted"},
   {assessmentId:"a",attemptNumber:3,status:"assigned"},
   {assessmentId:"a",attemptNumber:2,status:"graded"},
  ];
  expect(latestGuardianAttempts(attempts)).toEqual([attempts[2],attempts[1]]);
 });
 it("counts returned revisions and overdue work without exposing ungraded scores", () => {
  const now=new Date("2026-10-16T12:00:00Z");
  const summary=guardianAssignmentSummary([
   {status:"assigned",dueAt:"2026-10-15T12:00:00Z",score:null},
   {status:"returned",dueAt:"2026-10-14T12:00:00Z",score:"80"},
   {status:"submitted",dueAt:"2026-10-12T12:00:00Z",score:null},
   {status:"graded",dueAt:null,score:"92"},
  ],now);
  expect(summary).toEqual({needsAction:2,overdue:2,releasedGrades:2});
 });
 it("handles assignments with no submissions", () => {
  expect(latestGuardianAttempts([{assessmentId:"a",attemptNumber:null}])).toHaveLength(1);
 });
});

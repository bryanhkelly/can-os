import { describe, expect, it } from "vitest";
import { guardianFeedbackReleased, latestGuardianAttempts, guardianAssignmentSummary, priorReturnedGuardianFeedback, releasedGuardianAttempts } from "@/domain/guardian-academics";

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
 it("keeps saved revision drafts on the guardian needs-action list",()=>{
  const now=new Date("2026-10-30T12:00:00Z");
  expect(guardianAssignmentSummary([
   {status:"draft",dueAt:"2026-10-20T12:00:00Z",score:null},
   {status:"draft",dueAt:"2026-11-20T12:00:00Z",score:null},
   {status:"submitted",dueAt:"2026-10-20T12:00:00Z",score:null},
  ],now)).toEqual({needsAction:2,overdue:1,releasedGrades:0});
 });
 it("keeps released prior feedback visible during a revision but never reuses its score",()=>{
  const history=[
   {assessmentId:"class-a",attemptNumber:1,submissionStatus:"returned",score:"8",feedback:"Explain reasoning"},
   {assessmentId:"class-a",attemptNumber:2,submissionStatus:"assigned",score:null,feedback:null},
   {assessmentId:"class-b",attemptNumber:1,submissionStatus:"returned",score:"7",feedback:"Other class"},
  ];
  expect(priorReturnedGuardianFeedback(history,history[1]!)?.feedback).toBe("Explain reasoning");
  const drafting={...history[1]!,submissionStatus:"draft"};
  expect(priorReturnedGuardianFeedback([...history,drafting],drafting)?.feedback).toBe("Explain reasoning");
  expect(guardianFeedbackReleased(drafting.submissionStatus)).toBe(false);
  expect(guardianFeedbackReleased(history[1]!.submissionStatus)).toBe(false);
  expect(priorReturnedGuardianFeedback(history,history[0]!)).toBeUndefined();
  expect(priorReturnedGuardianFeedback(history,history[2]!)).toBeUndefined();
  expect(priorReturnedGuardianFeedback([
   {assessmentId:"class-a",attemptNumber:1,submissionStatus:"submitted"},
   {assessmentId:"class-a",attemptNumber:2,submissionStatus:"assigned"},
  ],{assessmentId:"class-a",attemptNumber:2,submissionStatus:"assigned"})).toBeUndefined();
 });
 it("handles assignments with no submissions", () => {
  expect(latestGuardianAttempts([{assessmentId:"a",attemptNumber:null}])).toHaveLength(1);
 });
});


describe("guardian follow-up history across revisions",()=>{
 it("retains only released attempts of the selected assessment without copying academic evidence",()=>{
  const history=[
   {assessmentId:"a",submissionId:"returned-1",attemptNumber:1,submissionStatus:"returned",score:"4",response:"Private response"},
   {assessmentId:"a",submissionId:"graded-2",attemptNumber:2,submissionStatus:"graded",score:"8",response:"Other response"},
   {assessmentId:"a",submissionId:"draft-3",attemptNumber:3,submissionStatus:"assigned",score:"private",response:"New draft"},
   {assessmentId:"a",submissionId:"submitted-4",attemptNumber:4,submissionStatus:"submitted"},
   {assessmentId:"b",submissionId:"unrelated",attemptNumber:1,submissionStatus:"graded"},
  ];
  expect(releasedGuardianAttempts(history,"a")).toEqual([
   {submissionId:"graded-2",attemptNumber:2},{submissionId:"returned-1",attemptNumber:1},
  ]);
 });
 it("excludes empty and unsubmitted assignment slots",()=>{
  expect(releasedGuardianAttempts([
   {assessmentId:"a",submissionId:null,attemptNumber:null,submissionStatus:null},
  ],"a")).toEqual([]);
 });
});

import { describe, expect, it } from "vitest";
import { assessmentAttemptLimit, assertAssessmentAttemptAllowed } from "@/domain/assessment-attempt-policy";
describe("canonical assessment attempt policy",()=>{
 it("preserves existing teacher-authorized revision behavior when no limit is configured",()=>{
  expect(assessmentAttemptLimit({})).toBeNull();
  expect(()=>assertAssessmentAttemptAllowed({},2)).not.toThrow();
 });
 it("counts the initial submission in the configured total",()=>{
  expect(()=>assertAssessmentAttemptAllowed({maxAttempts:1},1)).not.toThrow();
  expect(()=>assertAssessmentAttemptAllowed({maxAttempts:1},2)).toThrow("attempt limit");
  expect(()=>assertAssessmentAttemptAllowed({maxAttempts:3},3)).not.toThrow();
 });
 it.each([0,-1,1.5,"2",null,101])("fails closed for malformed stored limits: %s",maxAttempts=>{
  expect(()=>assertAssessmentAttemptAllowed({maxAttempts},1)).toThrow("invalid attempt limit");
 });
});

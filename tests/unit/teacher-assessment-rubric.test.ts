import { describe, expect, it } from "vitest";
import { validateAssessmentRubric } from "@/domain/teacher-assessment-rubric";

const rubric = [
 { id:"reasoning", label:"Reasoning", maxPoints:6, description:"Explain the steps." },
 { id:"accuracy", label:"Accuracy", maxPoints:4 },
];
describe("teacher-authored assessment scoring rubric",()=>{
 it("allows no rubric or one matching the gradebook point total",()=>{
  expect(validateAssessmentRubric([],10)).toEqual([]);
  expect(validateAssessmentRubric(rubric,10)).toEqual(rubric);
 });
 it("rejects duplicates, unsafe IDs, and missing labels",()=>{
  expect(()=>validateAssessmentRubric([...rubric,rubric[0]],16)).toThrow(/unique/);
  expect(()=>validateAssessmentRubric([{...rubric[0],id:"../bad"}],6)).toThrow();
  expect(()=>validateAssessmentRubric([{...rubric[0],label:""}],6)).toThrow();
 });
 it("rejects rubrics with wrong totals or overly precise points",()=>{
  expect(()=>validateAssessmentRubric(rubric,9)).toThrow(/total/);
  expect(()=>validateAssessmentRubric([{id:"test",label:"Test",maxPoints:6.333}],6.33)).toThrow(/decimal/);
 });
 it("enforces bounded rubric size and valid assignment points",()=>{
  expect(()=>validateAssessmentRubric([],0)).toThrow(/between/);
  const many=Array.from({length:21},(_,i)=>({id:"c-"+i,label:"Criterion "+i,maxPoints:1}));
  expect(()=>validateAssessmentRubric(many,21)).toThrow();
 });
});

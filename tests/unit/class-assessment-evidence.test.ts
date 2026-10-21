import {describe,it,expect} from "vitest";
import {buildClassAssessmentEvidence,summarizeClassAssessmentEvidence} from "@/domain/class-assessment-evidence";

const items=[
 {id:"formative",title:"Unit 1 practice",status:"published" as const,pointsPossible:"20.00",
  metadata:{unitId:"algebra1-u01"}},
 {id:"checkpoint",title:"Unit 1 checkpoint",status:"published" as const,pointsPossible:"30.00",
  metadata:{unitId:"algebra1-u01"}},
 {id:"teacher-draft",title:"Not released",status:"draft" as const,pointsPossible:"10.00",metadata:{}},
];
describe("class assessment evidence (not course credit or mastery)",()=>{
 it("keeps only student-scoped latest attempts and hides teacher drafts",()=>{
  const evidence=buildClassAssessmentEvidence(items,[
    {assessmentId:"formative",attemptNumber:1,status:"graded",score:"8"},
    {assessmentId:"formative",attemptNumber:2,status:"submitted",score:null},
    {assessmentId:"checkpoint",attemptNumber:1,status:"graded",score:"28"},
  ]);
  expect(evidence).toHaveLength(2);
  expect(evidence[0]).toMatchObject({id:"formative",unitId:"algebra1-u01",status:"submitted",score:null,attemptNumber:2});
  expect(evidence[1]).toMatchObject({status:"graded",score:28,pointsPossible:30});
  expect(summarizeClassAssessmentEvidence(evidence)).toEqual({assigned:2,graded:1,awaitingFeedback:1,notSubmitted:0});
 });
 it("does not treat unsubmitted work or a completion flag as a grade",()=>{
  const evidence=buildClassAssessmentEvidence(items,[]);
  expect(evidence.every(row=>row.score===null)).toBe(true);
  expect(summarizeClassAssessmentEvidence(evidence)).toEqual({assigned:2,graded:0,awaitingFeedback:0,notSubmitted:2});
 });
 it("does not disclose draft or submitted scores before teacher review",()=>{
  const evidence=buildClassAssessmentEvidence(items,[
    {assessmentId:"formative",attemptNumber:1,status:"assigned",score:"19"},
    {assessmentId:"checkpoint",attemptNumber:1,status:"submitted",score:"27"},
  ]);
  expect(evidence.map(row=>row.score)).toEqual([null,null]);
 });
 it("ignores unsafe metadata unit identifiers and invalid point values",()=>{
  const evidence=buildClassAssessmentEvidence([
    {id:"x",title:"x",status:"published",pointsPossible:"not-a-number",metadata:{unitId:"../other-school"}},
  ],[{assessmentId:"x",attemptNumber:1,status:"returned",score:"not-a-score"}]);
  expect(evidence[0]).toMatchObject({unitId:null,pointsPossible:null,score:null});
 });
});

import { describe, expect, it } from "vitest";
import { evaluateNoncreditCompletion } from "@/domain/noncredit-completion";
const now=new Date("2026-11-14");
const policy={trainingVersionId:"t1",effectiveAt:new Date("2026-11-01"),minParticipationMinutes:50,requireAllLessons:false,skillsAssessmentRequired:true,minimumAssessmentFraction:0.8};
const event={id:"e1",supersedesId:null,eventKind:"lesson_completed" as const,countedMinutes:50,evidenceVersionId:"verified"};
const assessment={learnerId:"learner",assessmentVersionId:"a1",resultStatus:"finalized" as const,pointsEarned:4,pointsPossible:5};
const base={registrationStatus:"active",trainingVersionId:"t1",trainingState:"published",learnerId:"learner",assessmentVersionId:"a1",policy,participation:[event],completedLessonCount:3,totalLessonCount:3,assessment,now};
describe("noncredit completion policy",()=>{
 it("requires separately evidenced time and finalized assessment",()=>{
   expect(evaluateNoncreditCompletion(base)).toMatchObject({eligible:true,countedMinutes:50,assessmentFraction:0.8,blockers:[]});
   expect(evaluateNoncreditCompletion({...base,assessment:{...assessment,resultStatus:"reviewed"}}).blockers).toContain("assessment_incomplete");
 });
 it("does not count unsupported playback estimates or superseded participation",()=>{
   const revision={...event,id:"e2",supersedesId:"e1",countedMinutes:20};
   expect(evaluateNoncreditCompletion({...base,participation:[event,revision]})).toMatchObject({eligible:false,countedMinutes:20});
   expect(evaluateNoncreditCompletion({...base,participation:[{...event,evidenceVersionId:null}]}).countedMinutes).toBe(0);
 });
 it("rejects other learner results and policy cross-wiring",()=>{
   expect(evaluateNoncreditCompletion({...base,assessment:{...assessment,learnerId:"other"}}).blockers).toContain("assessment_incomplete");
   expect(evaluateNoncreditCompletion({...base,policy:{...policy,trainingVersionId:"wrong"}}).blockers).toContain("policy_unavailable");
 });
 it("requires each configured lesson separately from any verified attendance minutes",()=>{
   const lessonPolicy={...policy,requireAllLessons:true,minParticipationMinutes:0,skillsAssessmentRequired:false,minimumAssessmentFraction:null};
   const partial=evaluateNoncreditCompletion({...base,policy:lessonPolicy,
     participation:[{...event,countedMinutes:0,evidenceVersionId:null}],
     completedLessonCount:2,totalLessonCount:3});
   expect(partial.countedMinutes).toBe(0);
   expect(partial.blockers).toContain("lessons_incomplete");
   expect(evaluateNoncreditCompletion({...base,policy:lessonPolicy,completedLessonCount:3,totalLessonCount:3,
     participation:[{...event,countedMinutes:0,evidenceVersionId:null}]}).eligible).toBe(true);
   expect(evaluateNoncreditCompletion({...base,policy:lessonPolicy,completedLessonCount:0,totalLessonCount:0}).eligible).toBe(false);
 });
 it("supports noncredit courses with no assessment requirement",()=>{
   const noExam={...policy,skillsAssessmentRequired:false,minimumAssessmentFraction:null};
   expect(evaluateNoncreditCompletion({...base,policy:noExam,assessment:null,learnerId:null,assessmentVersionId:null}).eligible).toBe(true);
 });
});

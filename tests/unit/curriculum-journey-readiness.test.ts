import { describe, expect, it } from "vitest";
import { summarizeCurriculumJourney, type JourneyEvidence } from "@/domain/curriculum-journey-readiness";

const base:JourneyEvidence={
 installedPacks:1,adoptedPacks:1,adoptedCourseVersions:2,
 classes:[{
  id:"sec-a",code:"ALG1-A",title:"Algebra I A",courseVersionId:"v1",publishedLessonCount:5,
  teacherCount:1,studentCount:2,assignedAssessmentCount:1,
  submittedAttemptCount:2,gradedAttemptCount:1,
 },{
  id:"sec-b",code:"ALG1-B",title:"Algebra I B",courseVersionId:"v1",publishedLessonCount:0,
  teacherCount:0,studentCount:0,assignedAssessmentCount:0,
  submittedAttemptCount:0,gradedAttemptCount:0,
 }],
};
describe("curriculum journey operational evidence",()=>{
 it("counts program-scoped instructional readiness without treating records as acceptance tests",()=>{
  expect(summarizeCurriculumJourney(base)).toEqual({
   packsInstalled:1,packsAdopted:1,courseVersionsAvailable:2,
   classesUsingAdoptedCourses:2,classesWithLessons:1,
   classesWithTeachers:1,classesWithStudents:1,
   classesWithAssignments:1,studentSubmissions:2,gradedSubmissions:1,
  });
 });
 it("does not fabricate completed lessons, assignments, submissions or grades",()=>{
  const result=summarizeCurriculumJourney({
   installedPacks:0,adoptedPacks:0,adoptedCourseVersions:0,classes:[],
  });
  expect(Object.values(result).every(n=>n===0)).toBe(true);
 });
 it("distinguishes published assignment evidence from student feedback",()=>{
  const result=summarizeCurriculumJourney({...base,classes:[
   {...base.classes[0]!,assignedAssessmentCount:2,submittedAttemptCount:0,gradedAttemptCount:0},
  ]});
  expect(result.classesWithAssignments).toBe(1);
  expect(result.studentSubmissions).toBe(0);
  expect(result.gradedSubmissions).toBe(0);
 });
});

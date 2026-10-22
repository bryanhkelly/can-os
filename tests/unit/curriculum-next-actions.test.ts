import {describe,expect,it} from "vitest";
import {schoolCurriculumNextActions} from "@/domain/curriculum-next-actions";
import type {JourneyEvidence} from "@/domain/curriculum-journey-readiness";

const base:JourneyEvidence={installedPacks:0,adoptedPacks:0,adoptedCourseVersions:0,classes:[]};
const classRow={id:"section1",title:"Algebra I",code:"ALG1-A",courseVersionId:"version1",
 publishedLessonCount:5,teacherCount:1,studentCount:1,assignedAssessmentCount:2,
 submittedAttemptCount:1,gradedAttemptCount:1};
describe("school curriculum next actions",()=>{
 it("links a new program to published pack discovery, not classroom login",()=>{
  expect(schoolCurriculumNextActions(base)).toEqual([expect.objectContaining({key:"install",destination:"packs"})]);
  expect(schoolCurriculumNextActions({...base,installedPacks:1})).toEqual([
   expect.objectContaining({key:"adopt",destination:"packs"}),
  ]);
 });
 it("directs an adopter to existing academic class provisioning",()=>{
  expect(schoolCurriculumNextActions({...base,installedPacks:1,adoptedPacks:1,adoptedCourseVersions:1}))
   .toEqual([expect.objectContaining({key:"sections",destination:"launch"})]);
 });
 it("surfaces only actual class gaps without inventing student-facing access",()=>{
  const evidence={...base,installedPacks:1,adoptedPacks:1,adoptedCourseVersions:1,classes:[
   {...classRow,publishedLessonCount:0,teacherCount:0,studentCount:0,assignedAssessmentCount:0},
  ]};
  const actions=schoolCurriculumNextActions(evidence);
  expect(actions.map(a=>a.key)).toEqual(["content","teachers","students"]);
  expect(actions.find(a=>a.key==="students")?.destination).toBe("none");
 });
 it("asks staffed empty-gradebook teachers to create work but gives registrars no teacher login",()=>{
  const evidence={...base,installedPacks:1,adoptedPacks:1,adoptedCourseVersions:1,classes:[
   {...classRow,assignedAssessmentCount:0},
  ]};
  const actions=schoolCurriculumNextActions(evidence);
  expect(actions).toEqual([expect.objectContaining({key:"assignments",destination:"none"})]);
 });
 it("reports no gaps when all tracked records are present",()=>{
  expect(schoolCurriculumNextActions({...base,installedPacks:1,adoptedPacks:1,
   adoptedCourseVersions:1,classes:[classRow]})).toEqual([]);
 });
});

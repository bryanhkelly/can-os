import {describe,expect,it} from "vitest";
import type {ClassContent} from "@/domain/class-content";
import {curriculumReleaseReadiness} from "@/domain/curriculum-release-readiness";
import {assertPublishableCurriculum} from "@/domain/curriculum-authoring";

const ready:ClassContent={version:1,syllabus:"Yearlong Algebra I syllabus",modules:[
 {id:"unit1",title:"Linear equations",lessons:[
  {id:"lesson1",title:"Equations",body:"Read the algebra explanations.",resources:[],
   learningTargets:["I can solve linear equations and explain each step."],standards:["A-REI.1"]},
 ]},
],resources:[]};
describe("publisher release readiness mirrors mandatory publication contract",()=>{
 it("identifies missing syllabus and course units as hard blockers",()=>{
  const content:ClassContent={version:1,syllabus:"",modules:[],resources:[]};
  const result=curriculumReleaseReadiness(content,null,"ALG1");
  expect(result.readyForPublisherPublication).toBe(false);
  expect(result.blockers).toContain("Add a course syllabus.");
  expect(result.blockers).toContain("Add at least one course unit with a lesson.");
  expect(()=>assertPublishableCurriculum(content)).toThrow();
 });
 it("identifies missing instructional content and empty units",()=>{
  const content:ClassContent={...ready,modules:[
   {id:"empty",title:"Empty unit",lessons:[]},
   {id:"unit2",title:"More",lessons:[{id:"missing",title:"Missing",body:"   ",resources:[]}]},
  ]};
  const result=curriculumReleaseReadiness(content,null,"ALG1");
  expect(result.blockers).toEqual(expect.arrayContaining([
   'Add a lesson to unit "Empty unit".',
   'Add instructional reading or a structured activity to "Missing".',
  ]));
  expect(()=>assertPublishableCurriculum(content)).toThrow();
 });
 it("separates advisory missing standards and teacher guides from publication blocking",()=>{
  const content:ClassContent={...ready,modules:[{...ready.modules[0]!,
   lessons:[{...ready.modules[0]!.lessons[0]!,learningTargets:[],standards:[]}],
  }]};
  const result=curriculumReleaseReadiness(content,null,"ALG1");
  expect(result.readyForPublisherPublication).toBe(true);
  expect(result.blockers).toEqual([]);
  expect(result.warnings).toEqual(expect.arrayContaining([
   "1 lesson(s) have no standards references.",
   "1 lesson(s) have no stated learning targets.",
   "No protected teacher guide is configured for this course.",
  ]));
  expect(()=>assertPublishableCurriculum(content)).not.toThrow();
  expect(result.creditApproved).toBe(false);
 });
 it("blocks invalid course content and safe-fails stale teacher guide refs",()=>{
  const invalid:ClassContent={...ready,resources:[{id:"bad",title:"Bad",url:"http://invalid.example/"}]};
  expect(curriculumReleaseReadiness(invalid,null,"ALG1").readyForPublisherPublication).toBe(false);
  const guides={version:1 as const,courseCode:"WRONG",visibility:"teacher_only" as const,units:[]};
  const result=curriculumReleaseReadiness(ready,guides,"ALG1");
  expect(result.readyForPublisherPublication).toBe(false);
  expect(result.blockers).toContain("Fix protected teacher guide references or its course code before publishing.");
 });
});

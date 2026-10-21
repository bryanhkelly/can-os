import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classContentSchema, readClassContent } from "@/domain/class-content";
import { classTeacherGuidesSchema, readClassTeacherGuides } from "@/domain/class-teacher-guides";
import { publisherLessonChoices, assertPublisherLessonReference } from "@/domain/publisher-course-references";

const load=(relative:string)=>JSON.parse(readFileSync(new URL(relative,import.meta.url),"utf8"));
const week1=load("../../curriculum/can-high-school-core/algebra1/unit01-week01.json");
const day1=load("../../curriculum/can-high-school-core/algebra1/week02-day01-draft.json");
const oldGuide=load("../../curriculum/can-high-school-core/algebra1/unit01-teacher-guide.json");
const newGuide=load("../../curriculum/can-high-school-core/algebra1/week02-day01-teacher-guide.json");

describe("Algebra I Week 2 Day 1 publisher curriculum draft",()=>{
 it("contains a complete 55-minute lesson with meaningful student practice",()=>{
  expect(day1.status).toBe("draft");
  expect(day1.readiness).toBe("teacher_review_required");
  expect(day1.authoredDays).toBe(1);
  expect(day1.assessments).toEqual([]);
  expect(day1.lessons).toHaveLength(1);
  const lesson=day1.lessons[0];
  expect(lesson.body.length).toBeGreaterThan(2800);
  expect(lesson.body).toContain("INDEPENDENT PRACTICE");
  expect(lesson.body).toContain("GUIDED PRACTICE");
  expect(lesson.body).toContain("EXIT TICKET");
  expect(lesson.activities.slice(0,5).reduce((sum:any,a:any)=>sum+a.estimatedMinutes,0)).toBe(55);
  expect(lesson.activities[5].kind).toBe("self_check");
  expect(lesson.standards).toEqual(["A-REI.1","A-REI.3"]);
 });
 it("merges into the existing publisher course unit, not a separate adopted week",()=>{
  const composed=classContentSchema.parse({version:1,syllabus:"Algebra I draft composition",
   modules:[{id:week1.unitId,title:week1.title,lessons:[...week1.lessons,...day1.lessons]}],
   resources:[]});
  expect(composed.modules).toHaveLength(1);
  expect(composed.modules[0].lessons).toHaveLength(6);
  expect(new Set(composed.modules[0].lessons.map((l:{id:string})=>l.id)).size).toBe(6);
  const draftCurriculum={learning:composed};
  expect(readClassContent(draftCurriculum)?.modules[0].lessons[5].id).toBe("u01-w02-d01");
  // A draft cannot be assigned by lesson ID; an accepted publisher course release can.
  expect(publisherLessonChoices(draftCurriculum,"draft")).toEqual([]);
  expect(()=>assertPublisherLessonReference(draftCurriculum,"draft","u01-w02-d01")).toThrow();
  expect(publisherLessonChoices(draftCurriculum,"published").some(l=>l.id==="u01-w02-d01")).toBe(true);
 });
 it("keeps teacher answers separate from student-facing lesson content",()=>{
  const combined=classTeacherGuidesSchema.parse({
   ...oldGuide,
   units:[{...oldGuide.units[0],lessons:[...oldGuide.units[0].lessons,...newGuide.units[0].lessons]}],
  });
  expect(combined.units[0].reviewStatus).toBe("draft");
  expect(combined.units[0].lessons.at(-1)?.lessonId).toBe("u01-w02-d01");
  expect(readClassTeacherGuides({teacherGuides:combined})).toEqual(combined);
  const studentOnly={version:1,syllabus:"Algebra I",modules:[{id:week1.unitId,title:week1.title,
   lessons:[...week1.lessons,...day1.lessons]}],resources:[]};
  expect(JSON.stringify(studentOnly)).not.toContain("workedAnswers");
  expect(JSON.stringify(studentOnly)).not.toContain("misconceptions");
 });
});

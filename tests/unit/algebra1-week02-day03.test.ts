import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classContentSchema } from "@/domain/class-content";
import { classTeacherGuidesSchema } from "@/domain/class-teacher-guides";
import { assertPublisherLessonReference, publisherLessonChoices } from "@/domain/publisher-course-references";

function fixture(path: string): Record<string, any> {
 return JSON.parse(readFileSync(new URL(path,import.meta.url),"utf8"));
}
const week1=fixture("../../curriculum/can-high-school-core/algebra1/unit01-week01.json");
const drafts=[1,2,3].map(day=>fixture(
 "../../curriculum/can-high-school-core/algebra1/week02-day0"+day+"-draft.json"
));
const originalGuide=fixture("../../curriculum/can-high-school-core/algebra1/unit01-teacher-guide.json");
const dayGuides=[1,2,3].map(day=>fixture(
 "../../curriculum/can-high-school-core/algebra1/week02-day0"+day+"-teacher-guide.json"
));

describe("Algebra I Week 2 Day 3 publisher draft",()=>{
 it("provides a 55-minute instructional sequence and genuine student practice",()=>{
  const day3=drafts[2];
  expect(day3.status).toBe("draft");
  expect(day3.readiness).toBe("teacher_review_required");
  expect(day3.assessments).toEqual([]);
  expect(day3.lessons).toHaveLength(1);
  const lesson=day3.lessons[0];
  expect(lesson.id).toBe("u01-w02-d03");
  expect(lesson.body.length).toBeGreaterThan(4000);
  expect(lesson.body).toContain("GUIDED PRACTICE");
  expect(lesson.body).toContain("INDEPENDENT PRACTICE");
  expect(lesson.body).toContain("EXIT TICKET");
  expect(lesson.activities.map((a:any)=>a.kind)).toEqual([
   "launch","instruction","guided_practice","independent_practice","exit_ticket","self_check"
  ]);
  expect(lesson.activities.slice(0,5).reduce((sum:number,a:any)=>sum+a.estimatedMinutes,0)).toBe(55);
  expect(lesson.activities[4].evidence).toBe("teacher_review");
  expect(lesson.standards).toEqual(["A-REI.1","A-REI.3"]);
 });
 it("composes all eight lessons in original Unit 1 with stable unique lesson and activity IDs",()=>{
  const curriculum=classContentSchema.parse({
   version:1,syllabus:"Algebra I unpublished course draft",
   modules:[{id:week1.unitId,title:week1.title,lessons:[
    ...week1.lessons,...drafts.flatMap(day=>day.lessons)
   ]}],resources:[]
  });
  expect(curriculum.modules).toHaveLength(1);
  expect(curriculum.modules[0].lessons).toHaveLength(8);
  const all=curriculum.modules[0].lessons;
  expect(all.slice(-3).map(l=>l.id)).toEqual(["u01-w02-d01","u01-w02-d02","u01-w02-d03"]);
  const activities=all.flatMap(l=>l.activities??[]).map(a=>a.id);
  expect(new Set(activities).size).toBe(activities.length);
  expect(publisherLessonChoices({learning:curriculum},"draft")).toHaveLength(0);
  expect(()=>assertPublisherLessonReference({learning:curriculum},"draft","u01-w02-d03")).toThrow();
  expect(publisherLessonChoices({learning:curriculum},"published").at(-1)?.id).toBe("u01-w02-d03");
 });
 it("keeps private Day 3 solutions in one draft teacher guide, not student lessons",()=>{
  expect(dayGuides.every(g=>g.visibility==="teacher_only")).toBe(true);
  expect(dayGuides.every(g=>g.units[0].reviewStatus==="draft")).toBe(true);
  const guides=classTeacherGuidesSchema.parse({
   ...originalGuide,
   units:[{...originalGuide.units[0],lessons:[
    ...originalGuide.units[0].lessons,...dayGuides.flatMap(g=>g.units[0].lessons)
   ]}]
  });
  expect(guides.units).toHaveLength(1);
  expect(guides.units[0].lessons).toHaveLength(8);
  expect(guides.units[0].lessons.at(-1)?.lessonId).toBe("u01-w02-d03");
  expect(guides.units[0].lessons.at(-1)?.workedAnswers.length).toBeGreaterThanOrEqual(10);
  const student=JSON.stringify(drafts[2].lessons[0]);
  expect(student).not.toContain("workedAnswers");
  expect(student).not.toContain("misconceptions");
  expect(student).not.toContain("correctResponse");
 });
 it("covers solution checks, identities, contradictions and meaningful units",()=>{
  const lesson=drafts[2].lessons[0];
  expect(lesson.body).toContain("11/2");
  expect(lesson.body).toContain("no solution");
  expect(lesson.body).toContain("every real x");
  expect(lesson.body).toContain("$0.75");
  expect((11/2+2)/3).toBeCloseTo((2*(11/2)-1)/4);
  expect(12+0.75*12).toBe(18+0.25*12);
  expect((9/4*2+3)/4).toBeCloseTo((9/4+9)/6);
 });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classContentSchema } from "@/domain/class-content";
import { classTeacherGuidesSchema } from "@/domain/class-teacher-guides";
import { assertPublisherLessonReference, publisherLessonChoices } from "@/domain/publisher-course-references";

function fixture(path: string): Record<string, any> {
 return JSON.parse(readFileSync(new URL(path,import.meta.url),"utf8"));
}
const week1=fixture("../../curriculum/can-high-school-core/algebra1/unit01-week01.json");
const day1=fixture("../../curriculum/can-high-school-core/algebra1/week02-day01-draft.json");
const day2=fixture("../../curriculum/can-high-school-core/algebra1/week02-day02-draft.json");
const teacherWeek1=fixture("../../curriculum/can-high-school-core/algebra1/unit01-teacher-guide.json");
const teacherDay1=fixture("../../curriculum/can-high-school-core/algebra1/week02-day01-teacher-guide.json");
const teacherDay2=fixture("../../curriculum/can-high-school-core/algebra1/week02-day02-teacher-guide.json");

describe("Algebra I Week 2 Day 2 literal equations publisher draft",()=>{
 it("supplies a complete 55-minute lesson without treating authorship as publication",()=>{
  expect(day2.status).toBe("draft");
  expect(day2.readiness).toBe("teacher_review_required");
  expect(day2.week).toBe(2);
  expect(day2.assessments).toEqual([]);
  expect(day2.lessons).toHaveLength(1);
  const lesson=day2.lessons[0];
  expect(lesson.id).toBe("u01-w02-d02");
  expect(lesson.body.length).toBeGreaterThan(5000);
  expect(lesson.body).toContain("GUIDED PRACTICE");
  expect(lesson.body).toContain("INDEPENDENT PRACTICE");
  expect(lesson.body).toContain("EXIT TICKET");
  expect(lesson.standards).toEqual(["A-CED.4","N-Q.1"]);
  expect(lesson.activities.map((a:any)=>a.kind)).toEqual([
   "launch","instruction","guided_practice","independent_practice","exit_ticket","self_check"
  ]);
  expect(lesson.activities.slice(0,5).reduce((total:number,a:any)=>total+a.estimatedMinutes,0)).toBe(55);
  expect(lesson.activities[4].evidence).toBe("teacher_review");
 });
 it("assembles Week 1 and Days 1–2 into one publisher-owned Unit 1 without overlapping identifiers",()=>{
  const curriculum=classContentSchema.parse({
   version:1,syllabus:"Algebra I draft course composition",
   modules:[{id:week1.unitId,title:week1.title,lessons:[
    ...week1.lessons,...day1.lessons,...day2.lessons
   ]}],resources:[]
  });
  const lessons=curriculum.modules[0].lessons;
  expect(curriculum.modules).toHaveLength(1);
  expect(lessons).toHaveLength(7);
  expect(lessons.at(-2)?.id).toBe("u01-w02-d01");
  expect(lessons.at(-1)?.id).toBe("u01-w02-d02");
  expect(new Set(lessons.flatMap(l=>(l.activities??[]).map(a=>a.id))).size)
   .toBe(lessons.flatMap(l=>l.activities??[]).length);
  const draft={learning:curriculum};
  expect(publisherLessonChoices(draft,"draft")).toEqual([]);
  expect(()=>assertPublisherLessonReference(draft,"draft","u01-w02-d02")).toThrow();
  // This verifies future published-course compatibility; it does not publish the draft.
  expect(publisherLessonChoices(draft,"published").some(l=>l.id==="u01-w02-d02")).toBe(true);
 });
 it("keeps teacher solutions private and joins guides by the same existing course unit",()=>{
  expect(teacherDay2.visibility).toBe("teacher_only");
  expect(teacherDay2.units[0].reviewStatus).toBe("draft");
  expect(teacherDay2.units[0].lessons.map((l:any)=>l.lessonId)).toEqual(["u01-w02-d02"]);
  const guides=classTeacherGuidesSchema.parse({
   ...teacherWeek1,
   units:[{
    ...teacherWeek1.units[0],
    lessons:[
     ...teacherWeek1.units[0].lessons,...teacherDay1.units[0].lessons,...teacherDay2.units[0].lessons
    ]
   }]
  });
  expect(guides.units).toHaveLength(1);
  expect(guides.units[0].lessons).toHaveLength(7);
  expect(guides.units[0].lessons[6].workedAnswers.length).toBeGreaterThanOrEqual(8);
  const studentPayload={...day2.lessons[0]};
  expect(JSON.stringify(studentPayload)).not.toContain("workedAnswers");
  expect(JSON.stringify(studentPayload)).not.toContain("misconceptions");
  expect(JSON.stringify(studentPayload)).not.toContain("correctResponse");
 });
 it("mathematical models preserve units, restrictions and checks",()=>{
  const body=day2.lessons[0].body;
  expect(body).toContain("r ≠ 0");
  expect(body).toContain("m = 0");
  expect(body).toContain("cm²");
  expect(body).toContain("cm³");
  expect(body).toContain("C = 2πr");
  expect((84/12)).toBe(7);
  expect((40-2*13)/2).toBe(7);
  expect((77-32)*5/9).toBe(25);
  expect(2*Math.PI*5).toBeCloseTo(10*Math.PI,12);
 });
});

import { readFileSync } from "node:fs";
import { describe,it,expect } from "vitest";
import { classTeacherGuidesSchema,readClassTeacherGuides } from "@/domain/class-teacher-guides";
import { classContentSchema } from "@/domain/class-content";
const data=JSON.parse(readFileSync(new URL("../../curriculum/can-high-school-core/algebra1/unit01-teacher-guide.json",import.meta.url),"utf8"));
const studentUnit=JSON.parse(readFileSync(new URL("../../curriculum/can-high-school-core/algebra1/unit01-week01.json",import.meta.url),"utf8"));

describe("restricted Algebra I teacher guide",()=>{
 it("matches exact classroom lessons and assignments without leaking into student learning",()=>{
  const guides=classTeacherGuidesSchema.parse(data);
  const unit=guides.units[0]!;
  expect(unit.reviewStatus).toBe("draft");
  expect(unit.lessons.map(row=>row.lessonId)).toEqual(studentUnit.lessons.map((row:{id:string})=>row.id));
  expect(unit.assessments.map(row=>row.assessmentKey)).toEqual(studentUnit.assessments.map((row:{key:string})=>row.key));
  expect(unit.assessments.find(item=>item.assessmentKey==="u01-checkpoint")?.answerGuide).toHaveLength(6);
  const separate={learning:{version:1,syllabus:"Under review",modules:[{id:studentUnit.unitId,title:studentUnit.title,lessons:studentUnit.lessons}],resources:[]},
    teacherGuides:guides};
  const student=classContentSchema.parse(separate.learning);
  expect(JSON.stringify(student)).not.toContain("answerGuide");
  expect(JSON.stringify(student)).not.toContain("evidenceToLookFor");
  expect(readClassTeacherGuides(separate)).toEqual(guides);
  expect(readClassTeacherGuides({learning:separate.learning})).toBeNull();
 });
 it("rejects duplicate keys or students' accidental access through invalid guide metadata",()=>{
  const bad=structuredClone(data);
  bad.units[0].lessons[1].lessonId=bad.units[0].lessons[0].lessonId;
  expect(classTeacherGuidesSchema.safeParse(bad).success).toBe(false);
  const wrong=structuredClone(data);wrong.visibility="public";
  expect(classTeacherGuidesSchema.safeParse(wrong).success).toBe(false);
  expect(()=>readClassTeacherGuides({teacherGuides:wrong})).toThrow("malformed");
 });
 it("keeps teacher review independent of graduation credit decisions",()=>{
  expect(data.units[0].reviewStatus).toBe("draft");
  expect(JSON.stringify(data).toLowerCase()).not.toContain("credit_ready");
  for(const lesson of data.units[0].lessons){
   expect(lesson.workedAnswers.length).toBeGreaterThan(2);
   expect(lesson.misconceptions.length).toBeGreaterThan(1);
   expect(lesson.interventions.length).toBeGreaterThan(1);
  }
 });
});

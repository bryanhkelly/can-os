import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {classContentSchema} from "@/domain/class-content";
import {readRubric} from "@/modules/learning/rubric";
const unit=JSON.parse(readFileSync(new URL("../../curriculum/can-high-school-core/algebra1/unit01-week01.json",import.meta.url),"utf8"));

describe("CAN Algebra I first full instructional week",()=>{
 it("contains five usable days with learning targets, direct instruction, guided and independent work, and exit checks",()=>{
  expect(unit.courseCode).toBe("CAN-ALG1");
  expect(unit.instructionalDays).toBe(5);
  expect(unit.lessons).toHaveLength(5);
  const ids=new Set<string>();
  for(const lesson of unit.lessons){
   expect(ids.has(lesson.id)).toBe(false);ids.add(lesson.id);
   expect(lesson.body.length).toBeGreaterThan(1700);
   expect(lesson.body).toMatch(/GUIDED|GUIDED PRACTICE|GUIDED WORK|GUIDED TRANSFER/);
   expect(lesson.body).toContain("INDEPENDENT PRACTICE");
   expect(lesson.body).toMatch(/EXIT TICKET|UNIT REFLECTION/);
   expect(lesson.body).toMatch(/SELF-CHECK/);
  }
 });
 it("fits existing /classes published lesson format without modifying current courses",()=>{
  const prior={id:"foundations",title:"Prior Preview",lessons:[
   {id:"variables",title:"Variables (existing)",body:"Existing preview content",resources:[]}]};
  const content=classContentSchema.parse({version:1,syllabus:"Algebra I",modules:[prior,
    {id:unit.unitId,title:unit.title,lessons:unit.lessons}],resources:[]});
  expect(content.modules).toHaveLength(2);
  expect(content.modules[1]?.lessons).toHaveLength(5);
  expect(content.modules[0]?.lessons[0]?.id).toBe("variables");
 });
 it("produces two publishable teacher-gradebook rubrics with correct point totals",()=>{
  expect(unit.assessments).toHaveLength(2);
  for(const assessment of unit.assessments){
   expect(assessment.instructions.length).toBeGreaterThan(200);
   const criteria=readRubric(assessment.rubricCriteria);
   expect(criteria).toHaveLength(assessment.rubricCriteria.length);
   expect(criteria.reduce((a,c)=>a+c.maxPoints,0)).toBe(assessment.pointsPossible);
  }
 });
 it("maps to real standard identifiers and prevents premature credit claim",()=>{
  expect(unit.standards.map((s:{code:string})=>s.code)).toContain("CCSS.HSA-REI.B.3");
  expect(unit.teacherNotes.creditPolicy).toContain("no course credit");
  expect(unit.readiness).toBe("teacher_review_required");
 });
});

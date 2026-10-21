import { readFileSync } from "node:fs";
import { describe,it,expect } from "vitest";
import { yearlongCourseBlueprintSchema,courseBlueprintCoverage } from "@/domain/yearlong-course-blueprint";
import { classContentSchema } from "@/domain/class-content";
import { assertPublishableCurriculum } from "@/domain/curriculum-authoring";

const blueprint=JSON.parse(readFileSync(
 new URL("../../curriculum/can-high-school-core/algebra1/yearlong-blueprint.json",import.meta.url),"utf8"));
const week1=JSON.parse(readFileSync(
 new URL("../../curriculum/can-high-school-core/algebra1/unit01-week01.json",import.meta.url),"utf8"));

describe("36-week Algebra I curriculum development plan",()=>{
 it("plans 36 individually mapped weeks without claiming school or A-G approval",()=>{
  const plan=yearlongCourseBlueprintSchema.parse(blueprint);
  const summary=courseBlueprintCoverage(plan);
  expect(summary).toEqual({
   plannedWeeks:36,authoredWeeks:1,reviewedWeeks:0,approvedWeeks:0,
   estimatedInstructionalMinutes:9900,plannedAssessmentCount:73,isCreditReady:false,
  });
  expect(new Set(plan.weeks.map(w=>w.unitId)).size).toBe(9);
  expect(plan.weeks[0]?.unitId).toBe(week1.unitId);
 });
 it("rejects missing weeks, duplicate weeks or premature credit-ready claims",()=>{
  const missing=structuredClone(blueprint);missing.weeks.pop();
  expect(yearlongCourseBlueprintSchema.safeParse(missing).success).toBe(false);
  const duplicate=structuredClone(blueprint);duplicate.weeks[1].week=1;
  expect(yearlongCourseBlueprintSchema.safeParse(duplicate).success).toBe(false);
  const bypass=structuredClone(blueprint);bypass.creditStatus="credit_ready";
  expect(yearlongCourseBlueprintSchema.safeParse(bypass).success).toBe(false);
 });
 it("treats Week 1 as typed activities rendered by existing /classes lesson contract",()=>{
  const learning=classContentSchema.parse({
   version:1,syllabus:"Review pending; not credit-ready",blueprint,
   modules:[{id:week1.unitId,title:week1.title,lessons:week1.lessons}],
   resources:[],
  });
  expect(learning.modules[0]?.lessons).toHaveLength(5);
  expect(learning.blueprint?.weeks).toHaveLength(36);
  expect(learning.blueprint?.creditStatus).toBe("not_credit_ready");
  for(const lesson of learning.modules[0]!.lessons){
   expect(lesson.estimatedMinutes).toBe(55);
   expect(lesson.learningTargets?.length).toBeGreaterThan(0);
   expect(lesson.activities?.length).toBeGreaterThanOrEqual(5);
   expect(lesson.activities!.filter(a=>a.estimatedMinutes).reduce((n,a)=>n+(a.estimatedMinutes??0),0)).toBe(55);
   expect(lesson.activities?.some(a=>a.kind==="guided_practice")).toBe(true);
   expect(lesson.activities?.some(a=>a.kind==="independent_practice")).toBe(true);
  }
  expect(()=>assertPublishableCurriculum(learning)).not.toThrow();
 });
 it("permits authored structured lessons with an empty legacy body but rejects empty instruction",()=>{
  const lesson=week1.lessons[0];
  const structured=classContentSchema.parse({version:1,syllabus:"Teacher-reviewed later",modules:[
   {id:"unit-test",title:"Unit",lessons:[{...lesson,id:"structured",body:""}]}],resources:[]});
  expect(()=>assertPublishableCurriculum(structured)).not.toThrow();
  const invalid={...structured,modules:[{id:"empty",title:"Empty",lessons:[
   {id:"empty-lesson",title:"Empty",body:"",resources:[]}]}]};
  expect(()=>assertPublishableCurriculum(invalid)).toThrow(/readable text or structured activities/);
 });
});

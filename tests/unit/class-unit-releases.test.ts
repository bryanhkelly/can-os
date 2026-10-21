import { describe,expect,it } from "vitest";
import { classContentSchema } from "@/domain/class-content";
import { classTeacherGuidesSchema } from "@/domain/class-teacher-guides";
import { assertUnitPublishable,composeClassUnits,composeClassTeacherGuides,unitDraftSchema } from "@/domain/class-unit-releases";

const lesson={id:"algebra1-w02-d01",title:"Week 2 Day 1",
  body:"Fractional coefficient equations with step-by-step worked examples.",
  resources:[],estimatedMinutes:55,learningTargets:["Solve fractional equations and justify each step."],
  activities:[{id:"w02-act01",kind:"guided_practice" as const,title:"Practice",
    instructions:"Solve (3/4)x+5=11 and check by substitution.",estimatedMinutes:15}]};
const base=classContentSchema.parse({version:1,syllabus:"Algebra I planning only; not credit-ready",
 modules:[{id:"algebra1-u01",title:"Week 1",lessons:[{id:"u01-d01",title:"Week 1 Day 1",body:"Expressions",resources:[]}]}],resources:[]});
const unit={unitKey:"algebra1-u01-w02",module:{id:"algebra1-u01-w02",title:"Week 2: Multi-step equations",lessons:[lesson]},
  teacherGuide:{unitId:"algebra1-u01-w02",reviewStatus:"teacher_reviewed" as const,
  teacherOverview:"Confirm rational coefficient equations and teacher-reviewed explanations.",
  lessons:[{lessonId:lesson.id,preparation:"Prepare a balance diagram for fractional equation steps.",
    workedAnswers:[{prompt:"Solve (3/4)x+5=11 with justification.",answer:"Subtract 5 from both sides, then multiply by 4/3; x=8."}],
    misconceptions:["Students distribute denominators only to the left side."],
    interventions:["Use inverse operations to preserve both sides of the equation."],
    extensions:[]}],assessments:[]}};
const release={unitKey:unit.unitKey,unitVersionId:"123e4567-e89b-42d3-a456-426614174999",
 module:unit.module,teacherGuide:unit.teacherGuide,status:"published",availableAt:null};

describe("independently versioned Algebra I section units",()=>{
 it("validates a reviewable teacher-guided instructional unit",()=>{
  expect(()=>assertUnitPublishable(unitDraftSchema.parse(unit))).not.toThrow();
  expect(()=>assertUnitPublishable({...unit,teacherGuide:{...unit.teacherGuide,reviewStatus:"draft"}})).toThrow("teacher-reviewed");
  expect(()=>assertUnitPublishable({...unit,module:{...unit.module,lessons:[]}})).toThrow("no lessons");
  expect(()=>unitDraftSchema.parse({...unit,module:{...unit.module,id:"other"}})).toThrow();
 });
 it("extends an actual class while preserving original course and lesson identities",()=>{
  const composed=composeClassUnits(base,[release]);
  expect(composed.content?.modules).toHaveLength(2);
  expect(composed.content?.modules[0]).toEqual(base.modules[0]);
  expect(composed.content?.modules[1]?.lessons[0]?.id).toBe("algebra1-w02-d01");
  expect(base.modules).toHaveLength(1);
 });
 it("does not expose draft, retired, or future-scheduled units",()=>{
  const now=new Date("2026-10-21T20:00:00.000Z");
  expect(composeClassUnits(base,[{...release,status:"draft"}],now).content?.modules).toHaveLength(1);
  expect(composeClassUnits(base,[{...release,availableAt:new Date("2026-11-01T00:00:00Z")}],now).content?.modules).toHaveLength(1);
  expect(composeClassUnits(base,[{...release,availableAt:new Date("2026-10-01T00:00:00Z")}],now).content?.modules).toHaveLength(2);
 });
 it("rejects duplicate IDs that could corrupt completion history",()=>{
  expect(()=>composeClassUnits(base,[{...release,module:{...unit.module,
    lessons:[{...lesson,id:"u01-d01"}]}}])).toThrow("Duplicate lesson");
  expect(()=>composeClassUnits(base,[{...release,unitKey:"algebra1-u01"}])).toThrow("Adopted unit identity mismatch");
 });
 it("merges teacher guides only for explicitly authorized teacher use and validates mappings",()=>{
  const existing=classTeacherGuidesSchema.parse({version:1,visibility:"teacher_only",courseCode:"CAN-ALG1",
   units:[{unitId:"algebra1-u01",reviewStatus:"draft",
    teacherOverview:"Week one teacher guidance for class learning.",
    lessons:[{lessonId:"u01-d01",preparation:"Review expression substitution and variable meaning.",
     workedAnswers:[{prompt:"Explain equivalent expressions with examples.",answer:"Rewrite by legal distribution and combining like terms."}],
     misconceptions:["Students combine unlike terms without reasoning."],
     interventions:["Model algebra tiles and check by substitution."],extensions:[]}],assessments:[]}]});
  const guides=composeClassTeacherGuides("CAN-ALG1",existing,[release]);
  expect(guides?.units.map(u=>u.unitId)).toEqual(["algebra1-u01","algebra1-u01-w02"]);
  expect(JSON.stringify(composeClassUnits(base,[release]).content)).not.toContain("workedAnswers");
  expect(()=>composeClassTeacherGuides("OTHER",existing,[release])).toThrow("course identity");
 });
 it("carries the new week in the same base progress namespace, without conferring credit",()=>{
  const composite=composeClassUnits(base,[release]).content!;
  expect(composite.blueprint).toBeUndefined();
  expect(composite.modules.flatMap(m=>m.lessons.map(l=>l.id))).toEqual(["u01-d01","algebra1-w02-d01"]);
  expect(unit.teacherGuide.reviewStatus).toBe("teacher_reviewed");
 });
});

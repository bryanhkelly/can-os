import { z } from "zod";

/** Deliberately distinct from the student-facing learning schema. This data
 * must never be included in a student/guardian ClassWorkspace response. */
const id=z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const narrative=z.string().trim().min(10).max(5000);
const guideLesson=z.object({
 lessonId:id,
 preparation:narrative,
 workedAnswers:z.array(z.object({prompt:narrative,answer:narrative}).strict()).min(1).max(15),
 misconceptions:z.array(narrative).min(1).max(12),
 interventions:z.array(narrative).min(1).max(12),
 extensions:z.array(narrative).max(10).default([]),
}).strict();
const guideAssessment=z.object({
 assessmentKey:id,
 title:z.string().trim().min(5).max(200),
 answerGuide:z.array(z.object({
 item:z.string().trim().min(1).max(60),correctResponse:narrative,
 evidenceToLookFor:narrative,
 }).strict()).min(1).max(25),
 scoringNotes:narrative,
}).strict();
const guideUnit=z.object({
 unitId:id,
 reviewStatus:z.enum(["draft","teacher_reviewed","school_approved"]),
 teacherOverview:narrative,
 lessons:z.array(guideLesson).min(1).max(50),
 assessments:z.array(guideAssessment).max(25),
}).strict().superRefine((unit,ctx)=>{
 for(const [kind,ids] of [
  ["lesson",unit.lessons.map(l=>l.lessonId)],
  ["assessment",unit.assessments.map(a=>a.assessmentKey)],
 ] as const) if(new Set(ids).size!==ids.length)ctx.addIssue({code:"custom",message:"Duplicate "+kind+" guide"});
});
export const classTeacherGuideUnitSchema=guideUnit;
export const classTeacherGuidesSchema=z.object({
 version:z.literal(1),
 courseCode:id,
 visibility:z.literal("teacher_only"),
 units:z.array(guideUnit).min(1).max(52),
}).strict().superRefine((value,ctx)=>{
 if(new Set(value.units.map(u=>u.unitId)).size!==value.units.length)
  ctx.addIssue({code:"custom",message:"Duplicate unit guide"});
});
export type ClassTeacherGuides=z.infer<typeof classTeacherGuidesSchema>;

/** Call only after authenticating a currently assigned teacher. */
export function readClassTeacherGuides(curriculum:Record<string,unknown>):ClassTeacherGuides|null{
 if(curriculum.teacherGuides===undefined)return null;
 const result=classTeacherGuidesSchema.safeParse(curriculum.teacherGuides);
 if(!result.success)throw new Error("The class teacher guide is malformed; request publisher review.");
 return result.data;
}

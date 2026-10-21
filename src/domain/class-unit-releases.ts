import { z } from "zod";
import { classContentSchema, classModuleSchema, type ClassContent } from "./class-content";
import { classTeacherGuidesSchema, type ClassTeacherGuides } from "./class-teacher-guides";

const key=z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
export const unitDraftSchema=z.object({
  unitKey:key,
  module:classModuleSchema,
  teacherGuide:classTeacherGuidesSchema.shape.units.element.optional(),
}).strict().superRefine((value,ctx)=>{
  if(value.module.id!==value.unitKey)ctx.addIssue({code:"custom",message:"Unit ID must match its module ID."});
  if(value.teacherGuide && (value.teacherGuide.unitId!==value.unitKey ||
    value.teacherGuide.lessons.some(guide=>!value.module.lessons.some(lesson=>lesson.id===guide.lessonId))))
    ctx.addIssue({code:"custom",message:"Teacher guide must reference the unit's lessons."});
});
export type UnitDraft=z.infer<typeof unitDraftSchema>;

/** This gate does not award credit. It only checks that instructional content is
 * complete enough for a qualified teacher and school to review before release. */
export function assertUnitPublishable(value:UnitDraft){
 const unit=unitDraftSchema.parse(value);
 if(!unit.module.lessons.length)throw new Error("Unit has no lessons.");
 if(unit.module.lessons.some(lesson=>!lesson.body.trim()&&!lesson.activities?.some(a=>a.instructions.trim())))
   throw new Error("All published lessons require instructional content.");
 if(unit.module.lessons.some(lesson=>lesson.resources.some(resource=>resource.documentId)))
   throw new Error("Private unit documents require a separate verified file publishing workflow.");
 if(!unit.teacherGuide ||
    unit.teacherGuide.reviewStatus!=="teacher_reviewed" && unit.teacherGuide.reviewStatus!=="school_approved" ||
    unit.teacherGuide.lessons.length!==unit.module.lessons.length ||
    !unit.teacherGuide.lessons.every(g=>unit.module.lessons.some(l=>l.id===g.lessonId)))
   throw new Error("A complete teacher-reviewed guide is required before unit publication.");
 const composite=classContentSchema.parse({version:1,modules:[unit.module],resources:[]});
 if(JSON.stringify(composite).length>300_000)
   throw new Error("Unit exceeds the 300 KB lesson content limit.");
 return unit;
}
export type PublishedUnit={
  unitKey:string;unitVersionId:string;status:string;
  module:Record<string,unknown>;teacherGuide:Record<string,unknown>|null;
  availableAt:Date|null;
};

/** Compose only published, explicitly pinned and already available sections.
 * No database mutation or course-version reassignment; collision is a hard error. */
export function composeClassUnits(base:ClassContent|null,units:PublishedUnit[],now=new Date()){
 const eligible=units.filter(u=>u.status==="published"&&(!u.availableAt||u.availableAt<=now));
 if(eligible.length&&!base)throw new Error("Cannot attach units to an unpublished base course.");
 if(!base)return {content:null,units:[] as PublishedUnit[]};
 const modules=eligible.map(u=>{
   const module=classModuleSchema.parse(u.module);
   if(module.id!==u.unitKey)throw new Error("Adopted unit identity mismatch.");
   return module;
 });
 const content=classContentSchema.parse({...base,modules:[...base.modules,...modules]});
 return {content,units:eligible};
}
export function composeClassTeacherGuides(
 courseCode:string,base:ClassTeacherGuides|null,units:PublishedUnit[],
):ClassTeacherGuides|null{
 const guides=units.filter(u=>u.teacherGuide).map(u=>{
   const parsed=classTeacherGuidesSchema.shape.units.element.parse(u.teacherGuide);
   if(parsed.unitId!==u.unitKey)throw new Error("Adopted teacher guide identity mismatch.");
   const module=classModuleSchema.parse(u.module);
   if(parsed.lessons.length!==module.lessons.length||
      !parsed.lessons.every(item=>module.lessons.some(lesson=>lesson.id===item.lessonId)))
     throw new Error("Teacher guide must match every adopted lesson.");
   return parsed;
 });
 if(base&&base.courseCode!==courseCode)throw new Error("Base teacher guide course identity mismatch.");
 if(!base&&!guides.length)return null;
 return classTeacherGuidesSchema.parse({
   version:1,visibility:"teacher_only",courseCode,
   units:[...(base?.units??[]),...guides],
 });
}

import { assertTeacherGuidesMatchCourse, curriculumDraftContent } from "./curriculum-authoring";
import type { ClassContent } from "./class-content";
import type { ClassTeacherGuides } from "./class-teacher-guides";

/**
 * Guidance for the existing publisher authoring screen.
 * "Blockers" mirror the mandatory content requirements checked again by the
 * authorized publication command. Warnings are advice, never new policy.
 */
export function curriculumReleaseReadiness(content: ClassContent, guides: ClassTeacherGuides|null, courseCode:string) {
 const blockers:string[]=[];
 const warnings:string[]=[];
 const validation=curriculumDraftContent.safeParse(content);
 if(!validation.success)blockers.push("Correct invalid draft fields, duplicate IDs or unsafe resources before publishing.");
 if(!content.syllabus.trim())blockers.push("Add a course syllabus.");
 if(!content.modules.length)blockers.push("Add at least one course unit with a lesson.");
 for(const unit of content.modules){
  if(!unit.lessons.length)blockers.push(`Add a lesson to unit "${unit.title||unit.id}".`);
  for(const lesson of unit.lessons){
   if(!lesson.body.trim()&&!lesson.activities?.some(activity=>activity.instructions.trim()))
    blockers.push(`Add instructional reading or a structured activity to "${lesson.title||lesson.id}".`);
  }
 }
 const lessons=content.modules.flatMap(unit=>unit.lessons);
 const missingTargets=lessons.filter(lesson=>!lesson.learningTargets?.length).length;
 const missingStandards=lessons.filter(lesson=>!lesson.standards?.length).length;
 if(missingTargets)warnings.push(`${missingTargets} lesson(s) have no stated learning targets.`);
 if(missingStandards)warnings.push(`${missingStandards} lesson(s) have no standards references.`);
 if(!guides)warnings.push("No protected teacher guide is configured for this course.");
 else {
  try{assertTeacherGuidesMatchCourse(content,guides,courseCode);}
  catch{blockers.push("Fix protected teacher guide references or its course code before publishing.");}
  const covered=new Set(guides.units.flatMap(unit=>unit.lessons.map(lesson=>lesson.lessonId)));
  const missing=lessons.filter(lesson=>lesson.activities?.some(activity=>activity.evidence==="teacher_review")&&!covered.has(lesson.id)).length;
  if(missing)warnings.push(`${missing} lesson(s) request teacher-reviewed evidence without a protected lesson guide.`);
 }
 const planned=content.blueprint?.weeks.filter(week=>week.status==="planned").length??0;
 if(planned)warnings.push(`${planned} planned week(s) have not advanced to authored or reviewed planning status. This is not a weekly publication requirement.`);
 return {
  blockers,warnings,
  unitCount:content.modules.length,lessonCount:lessons.length,
  readyForPublisherPublication:blockers.length===0,
  creditApproved:false as const,
 };
}

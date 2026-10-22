import { classContentSchema } from "./class-content";

/** Only an intentionally small public discovery summary leaves the publisher's release.
 * Never include teacher guides, answers, full lesson text or attached private files.
 */
export function schoolCourseOutline(curriculum: Record<string,unknown>) {
 const parsed=classContentSchema.safeParse(curriculum.learning);
 if(!parsed.success)return null;
 const content=parsed.data;
 return {
  syllabusSummary:content.syllabus.trim().slice(0,240),
  moduleCount:content.modules.length,
  lessonCount:content.modules.reduce((total,module)=>total+module.lessons.length,0),
  weeksPlanned:content.blueprint?.targetInstructionalWeeks??null,
  modules:content.modules.slice(0,24).map(module=>({
   id:module.id,title:module.title,lessonCount:module.lessons.length,
   lessonTitles:module.lessons.slice(0,5).map(lesson=>lesson.title),
  })),
  outlineTruncated:content.modules.length>24,
 };
}

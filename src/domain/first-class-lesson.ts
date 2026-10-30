import { readClassContent } from "./class-content";

/** Route-only request to open the student's first eligible published lesson.
 * Never treat it as a real curricular lesson ID or an access credential.
 */
export const FIRST_PUBLISHED_LESSON_ROUTE="__first_published_lesson__";


/**
 * "Published" means a version is authorized for release, not that it offers
 * instruction. A class is ready to receive its first student only when the
 * published version contains an actual learner-facing lesson with material
 * to read, practice or open.
 */
/** Shared predicate for actual placement readiness and the first-lesson
 * route; empty lesson shells must never be presented as launch-ready work.
 */
export function isLearnerFacingInstruction(lesson:{
  body:string;activities?:readonly {instructions:string}[];
  resources:readonly unknown[];
}):boolean {
  return lesson.body.trim().length>0 ||
    lesson.activities?.some(activity=>activity.instructions.trim().length>0)===true ||
    lesson.resources.length>0;
}
export function hasAccessibleFirstLesson(curriculum:Record<string,unknown>):boolean {
  const content=readClassContent(curriculum);
  if(!content)return false;
  return content.modules.some(module=>module.lessons.some(isLearnerFacingInstruction));
}
export function requireAccessibleFirstLesson(curriculum:Record<string,unknown>):void {
  if(!hasAccessibleFirstLesson(curriculum))
    throw new Error("Publish at least one student-accessible instructional lesson before placing students into this class");
}

import { readClassContent } from "./class-content";

/**
 * "Published" means a version is authorized for release, not that it offers
 * instruction. A class is ready to receive its first student only when the
 * published version contains an actual learner-facing lesson with material
 * to read, practice or open.
 */
export function hasAccessibleFirstLesson(curriculum:Record<string,unknown>):boolean {
  const content=readClassContent(curriculum);
  if(!content)return false;
  return content.modules.some(module=>module.lessons.some(lesson=>
    Boolean(lesson.body.trim()) ||
    lesson.activities?.some(activity=>Boolean(activity.instructions.trim())) === true ||
    lesson.resources.length>0
  ));
}
export function requireAccessibleFirstLesson(curriculum:Record<string,unknown>):void {
  if(!hasAccessibleFirstLesson(curriculum))
    throw new Error("Publish at least one student-accessible instructional lesson before placing students into this class");
}

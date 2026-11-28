import { z } from "zod";
import { DomainError } from "./errors";
import { classContentSchema, classResources, type ClassContent } from "./class-content";
import { classTeacherGuidesSchema, type ClassTeacherGuides } from "./class-teacher-guides";

export const curriculumDraftContent = classContentSchema.superRefine((content, context) => {
  if (JSON.stringify(content).length > 3_000_000)
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Curriculum must be at most 3,000,000 characters. Save lessons individually for larger courses." });
  if (content.modules.some(module => !module.title.trim() || module.lessons.some(lesson => !lesson.title.trim())) ||
      classResources(content).some(resource => !resource.title.trim()))
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Module, lesson and resource titles cannot be blank." });
  if (classResources(content).some(resource => resource.documentId))
    context.addIssue({ code: z.ZodIssueCode.custom, message: "This authoring workflow supports HTTPS resources only; private documents require a verified publishing workflow." });
});

export function assertPublishableCurriculum(content: ClassContent) {
  if(!curriculumDraftContent.safeParse(content).success)
    throw new DomainError("VALIDATION_FAILED","Curriculum does not satisfy the publication content requirements.");
  if (!content.syllabus.trim()) throw new DomainError("VALIDATION_FAILED","Add a syllabus before publishing.");
  if (!content.modules.length || content.modules.some(module => !module.lessons.length))
    throw new DomainError("VALIDATION_FAILED","Every published module must contain at least one lesson.");
  if (content.modules.some(module => module.lessons.some(lesson =>
      !lesson.body.trim() && !(lesson.activities?.some(activity => activity.instructions.trim())))))
    throw new DomainError("VALIDATION_FAILED","Every published lesson must contain reading content or structured activities.");
}

/**
 * Teacher-only publisher guidance must belong to the same immutable course.
 * Validate both while saving a draft and immediately before publication.
 */
export function assertTeacherGuidesMatchCourse(content:ClassContent,raw:ClassTeacherGuides,courseCode:string){
 const guides=classTeacherGuidesSchema.parse(raw);
 if(guides.courseCode!==courseCode)throw new DomainError("VALIDATION_FAILED","Teacher guide course code must match its publisher course.");
 for(const unit of guides.units){
  const module=content.modules.find(m=>m.id===unit.unitId);
  if(!module)throw new DomainError("VALIDATION_FAILED","Teacher guide refers to a module outside this course.");
  const ids=new Set(module.lessons.map(l=>l.id));
  for(const lesson of unit.lessons){
   if(!ids.has(lesson.lessonId))throw new DomainError("VALIDATION_FAILED","Teacher guide lesson must exist inside its matching course module.");
  }
 }
 return guides;
}

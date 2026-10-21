import { z } from "zod";
import { classContentSchema, classResources, type ClassContent } from "./class-content";

export const curriculumDraftContent = classContentSchema.superRefine((content, context) => {
  if (JSON.stringify(content).length > 500_000)
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Curriculum must be at most 500,000 characters." });
  if (content.modules.some(module => !module.title.trim() || module.lessons.some(lesson => !lesson.title.trim())) ||
      classResources(content).some(resource => !resource.title.trim()))
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Module, lesson and resource titles cannot be blank." });
  if (classResources(content).some(resource => resource.documentId))
    context.addIssue({ code: z.ZodIssueCode.custom, message: "This authoring workflow supports HTTPS resources only; private documents require a verified publishing workflow." });
});

export function assertPublishableCurriculum(content: ClassContent) {
  curriculumDraftContent.parse(content);
  if (!content.syllabus.trim()) throw new Error("Add a syllabus before publishing.");
  if (!content.modules.length || content.modules.some(module => !module.lessons.length))
    throw new Error("Every published module must contain at least one lesson.");
  if (content.modules.some(module => module.lessons.some(lesson =>
      !lesson.body.trim() && !(lesson.activities?.some(activity => activity.instructions.trim())))))
    throw new Error("Every published lesson must contain readable text or structured activities.");
}

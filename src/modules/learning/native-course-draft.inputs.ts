import { z } from "zod";
import { saveNativeCourseLessonDraftSchema } from "@/domain/native-course-lesson-draft";
const uuid=z.string().uuid();
export const draftCourseInput=z.object({courseVersionId:uuid}).strict();
export const draftLessonInput=saveNativeCourseLessonDraftSchema;
export const assignmentInput=z.object({
  courseVersionId:uuid,
  assignmentKey:z.string().trim().regex(/^[a-z][a-z0-9_-]{2,79}$/),
  title:z.string().trim().min(3).max(200),
  instructions:z.string().trim().min(5).max(12000),
  required:z.boolean(),
}).strict();
export const draftLessonListInput=draftCourseInput.extend({offset:z.number().int().min(0).max(1000000).default(0)}).strict();
export const draftAssignmentsInput=draftCourseInput.extend({offset:z.number().int().min(0).max(1000000).default(0)}).strict();

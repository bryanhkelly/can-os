import { z } from "zod";

/** Editable human-facing fields inside a native Course lesson draft.
 * All other publisher-owned fields (including rights, answers, media,
 * safeguarding and release metadata) are retained server-side, never
 * accepted from the form or silently overwritten. */
export const nativeLessonSegmentsSchema=z.array(z.object({
  title:z.string().trim().min(3).max(160),
  minutes:z.number().int().min(1).max(90),
}).strict()).min(1).max(18);

const editableLesson=z.object({
  title:z.string().trim().min(3).max(200),
  objectives:z.array(z.string().trim().min(3).max(250)).min(1).max(10),
  segments:nativeLessonSegmentsSchema,
}).strict();
const validateDuration=(value:{segments:readonly {minutes:number}[]},
  ctx:z.RefinementCtx)=>{
  const minutes=value.segments.reduce((sum,segment)=>sum+segment.minutes,0);
  if(minutes>180)ctx.addIssue({code:"custom",path:["segments"],
    message:"A draft lesson must fit within 180 minutes."});
};
export const nativeCourseLessonEditableSchema=editableLesson.superRefine(validateDuration);
export const saveNativeCourseLessonDraftSchema=editableLesson.extend({
  courseVersionId:z.string().uuid(),
  lessonId:z.string().uuid(),
  expectedRevision:z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine(validateDuration);

export type NativeCourseLessonEditable=z.infer<typeof nativeCourseLessonEditableSchema>;

/** Does not invent editable data for an unknown Course content format. */
export function readEditableNativeLesson(title:string,content:unknown):
  NativeCourseLessonEditable|null{
  if(!content||typeof content!=="object"||Array.isArray(content))return null;
  const record=content as Record<string,unknown>;
  const parsed=nativeCourseLessonEditableSchema.safeParse({
    title,objectives:record.objectives,segments:record.segments,
  });
  return parsed.success?parsed.data:null;
}

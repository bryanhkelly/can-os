import {z} from "zod";
const uuid=z.string().uuid();
const phase=z.enum(["baseline","final"]).optional();
export const course=z.object({courseAttemptId:uuid,phase}).strict();
export const start=course.extend({requestId:uuid}).strict();
export const submit=start.extend({
  attemptId:uuid,
  answers:z.array(z.object({
    questionId:uuid,
    optionIds:z.array(uuid).min(1).max(32),
  }).strict()).min(1).max(100),
}).strict();
export const review=z.object({courseAttemptId:uuid,assessmentAttemptId:uuid}).strict();
export const draft=course.extend({
  attemptId:uuid,questionId:uuid,requestId:uuid,
  optionIds:z.array(uuid).max(32),
}).strict();


export const completion=z.object({courseAttemptId:uuid}).strict();

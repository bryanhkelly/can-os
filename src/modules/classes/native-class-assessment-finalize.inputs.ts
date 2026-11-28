import {z} from "zod";
export const pendingInput=z.object({classId:z.string().uuid()}).strict();
export const input=z.object({classEnrollmentId:z.string().uuid(),
  assessmentAttemptId:z.string().uuid()}).strict();

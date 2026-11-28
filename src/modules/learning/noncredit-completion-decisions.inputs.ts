import {z} from "zod";
export const schema=z.object({
  courseAttemptId:z.string().uuid(),
  expectedPolicyId:z.string().uuid(),
  assessmentResultId:z.string().uuid().nullable(),
}).strict();

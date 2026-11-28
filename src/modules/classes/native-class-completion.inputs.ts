import {z} from "zod";
const uuid=z.string().uuid();
export const inspectInput=z.object({classEnrollmentId:uuid}).strict();
export const decideInput=z.object({
  classEnrollmentId:uuid,
  expectedPolicyVersionId:uuid,
  expectedPriorOutcomeId:uuid.nullable(),
  outcome:z.enum(["completed","not_yet_completed","voided"]),
  evidenceVersionId:uuid,
  reason:z.string().trim().min(10).max(1000),
}).strict();
export const queueInput=z.object({
  classId:uuid,
  page:z.number().int().min(0).max(100).default(0),
}).strict();

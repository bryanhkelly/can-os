import {z} from "zod";

const uuid=z.string().uuid();
export const authorizeNativeClassRepeatInput=z.object({
  priorEnrollmentId:uuid,
  completionOutcomeId:uuid,
  evidenceVersionId:uuid,
  reason:z.string().trim().min(10).max(1000),
}).strict();

export const listNativeClassRepeatCandidatesInput=z.object({classId:uuid}).strict();

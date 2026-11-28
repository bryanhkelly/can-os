import {z} from "zod";
const uuid=z.string().uuid();
export const input=z.object({
  classId:uuid,
  expectedLatestVersion:z.number().int().positive().nullable(),
  requireAllLessons:z.boolean(),
  requiredVerifiedSessions:z.number().int().min(0).max(52),
  requirePassingAssessment:z.boolean(),
  policyEvidenceVersionId:uuid,
  effectiveAt:z.string().datetime({offset:true}).optional(),
}).strict().refine(data=>data.requireAllLessons||
  data.requiredVerifiedSessions>0||data.requirePassingAssessment,
  "An independently approved policy must specify meaningful completion evidence");

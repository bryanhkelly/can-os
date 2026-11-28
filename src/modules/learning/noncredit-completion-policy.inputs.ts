import {z} from "zod";
export const input=z.object({
  trainingVersionId:z.string().uuid(),
  expectedLatestPolicyVersion:z.number().int().min(1).nullable(),
  minParticipationMinutes:z.number().int().min(0).max(100000),
  requireAllLessons:z.boolean(),
  skillsAssessmentRequired:z.boolean(),
  minimumAssessmentFraction:z.number().min(0).max(1).nullable(),
  completionMode:z.enum(["provider_review","automatic"]),
}).strict().refine(data=>
  !data.skillsAssessmentRequired||data.minimumAssessmentFraction!==null,
  "A required knowledge check must have a published passing threshold",
).refine(data=>data.skillsAssessmentRequired||
  data.minimumAssessmentFraction===null,
  "An optional knowledge check cannot define a required passing threshold",
);

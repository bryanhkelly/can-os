import {z} from "zod";
export const schema = z.object({
  registrationId: z.string().uuid(),
  expectedCurrentDecisionId: z.string().uuid(),
  outcome: z.enum(["not_yet_completed", "voided"]),
  evidenceVersionId: z.string().uuid(),
  reason: z.string().trim().min(10).max(1000),
}).strict();

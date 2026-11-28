import {z} from "zod";
export const input = z.object({
  issuanceId: z.string().uuid(),
  evidenceVersionId: z.string().uuid(),
  reason: z.string().trim().min(10).max(1000),
}).strict();

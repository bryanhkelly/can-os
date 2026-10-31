import { z } from "zod";

/** A decision targets the configuration actually presented to the reviewer.
 * The server still rechecks current institutional authority and evidence.
 */
export const schoolOpeningDecisionSchema = z.object({
  programId: z.string().uuid(),
  configurationId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  decision: z.enum(["approve", "suspend"]),
  reason: z.string().trim().min(10).max(500),
}).strict();

export type SchoolOpeningDecision = z.infer<typeof schoolOpeningDecisionSchema>;

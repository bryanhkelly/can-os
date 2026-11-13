import { z } from "zod";

export const executeBlueprintConfigurationInputSchema = z.object({
  configurationVersionId: z.string().uuid(),
  reviewId: z.string().uuid(),
  operationId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(200),
}).strict();

export type ExecuteBlueprintConfigurationInput =
  z.infer<typeof executeBlueprintConfigurationInputSchema>;

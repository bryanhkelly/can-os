import { z } from "zod";

export const executeBlueprintConfigurationInputSchema = z.object({
  configurationVersionId: z.string().uuid(),
  reviewId: z.string().uuid(),
  operationId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(200),
}).strict();

export type ExecuteBlueprintConfigurationInput =
  z.infer<typeof executeBlueprintConfigurationInputSchema>;

/**
 * Deployment codes are unique within an Operation. Different approved
 * Blueprint configuration versions may adopt the same Offering and component;
 * include the configuration version to avoid a database uniqueness collision.
 */
export function blueprintDeploymentCode(
  offeringCode: string,
  configurationVersionId: string,
  componentId: string,
  offeringVersionId: string,
): string {
  const product = offeringCode.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 32);
  const configurationKey = configurationVersionId.replaceAll("-", "").slice(0, 12);
  const componentKey = componentId.replaceAll("-", "").slice(0, 8);
  const versionKey = offeringVersionId.replaceAll("-", "").slice(0, 8);
  return `bp-${product || "offering"}-${configurationKey}-${componentKey}-${versionKey}`;
}

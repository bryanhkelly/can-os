import { z } from "zod";
import { isExtendedLearningType, type ProgramType } from "./program-offerings";

/**
 * Operator-published offering contract. This is a documented human attestation,
 * NOT an automated determination of childcare/licensing/legal compliance.
 * Only the server publishing command may write this snapshot.
 */
export const enrichmentPublicationSchema = z.object({
  version: z.literal(1),
  permissionVersion: z.string().min(1).max(80),
  permissionText: z.string().min(30).max(6000),
  approvedByPersonId: z.string().uuid(),
  publishedAt: z.string().datetime(),
  siteId: z.string().uuid(),
  programId: z.string().uuid(),
  seasonId: z.string().uuid(),
  operationalResponsibilityConfirmed: z.literal(true),
}).strict();

export type EnrichmentPublication = z.infer<typeof enrichmentPublicationSchema>;

export function readEnrichmentPublication(metadata: Record<string, unknown> | null):
  EnrichmentPublication | null {
  const result = enrichmentPublicationSchema.safeParse(metadata?.enrichmentPublication);
  return result.success ? result.data : null;
}

export function assertEnrichmentRegistrationPublished(input: {
  programType: ProgramType | null;
  programStatus: string | null;
  activityStatus: string;
  seasonStatus: string;
  siteId: string;
  programSiteId: string | null;
  programId: string | null;
  seasonId: string;
  creditIssuerId: string | null;
  metadata: Record<string, unknown>;
  consentVersion: string;
  acknowledged: boolean | undefined;
}): EnrichmentPublication {
  if (!input.programType || !isExtendedLearningType(input.programType) ||
    input.creditIssuerId !== null || input.programStatus !== "active" ||
    input.activityStatus !== "active" || input.seasonStatus !== "registration" ||
    !input.programId || input.programSiteId !== input.siteId) {
    throw new Error("This enrichment offering is not open for registration");
  }
  const published = readEnrichmentPublication(input.metadata);
  if (!published || published.programId !== input.programId ||
    published.seasonId !== input.seasonId || published.siteId !== input.siteId) {
    throw new Error("Enrichment registration requires an explicitly published permission statement");
  }
  if (input.consentVersion !== published.permissionVersion || input.acknowledged !== true) {
    throw new Error("Review and acknowledge the current enrichment permission statement");
  }
  return published;
}

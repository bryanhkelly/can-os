import { and, desc, eq, gte, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { evidenceDocuments, evidenceDocumentVersions } from "@/db/canonical-v301";
import { assertCapability, AuthorizationError, type CommandContext } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";

export const blueprintReviewEvidenceInputSchema = z.object({
  owningOrganizationId: z.string().uuid(),
}).strict();

/**
 * Reviewers see labels for their Organization's verified, current evidence,
 * not raw document contents, storage keys or other Organizations' documents.
 */
export async function listBlueprintReviewEvidence(
  context: CommandContext,
  rawInput: unknown,
) {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated session");
  assertCapability(context, "blueprint.review");
  if (process.env.CAN_CANONICAL_BLUEPRINT_WRITE_ENABLED !== "true") {
    throw new DomainError("UNAVAILABLE", "Canonical Blueprint review is not enabled.");
  }
  const { owningOrganizationId } = blueprintReviewEvidenceInputSchema.parse(rawInput);
  if (!context.scope.organizationIds?.includes(owningOrganizationId)) {
    throw new AuthorizationError("Blueprint review evidence Organization scope");
  }

  const versions = await db.select({
    id: evidenceDocumentVersions.id,
    documentId: evidenceDocuments.id,
    kind: evidenceDocuments.kindCode,
    title: sql<string>`education_v30.evidence_documents.title`,
  }).from(evidenceDocuments)
    .innerJoin(evidenceDocumentVersions,
      eq(evidenceDocumentVersions.documentId, evidenceDocuments.id))
    .where(and(
      eq(evidenceDocuments.owningOrganizationId, owningOrganizationId),
      isNotNull(evidenceDocumentVersions.verifiedAt),
      or(isNull(evidenceDocumentVersions.validFrom),
        lte(evidenceDocumentVersions.validFrom, sql`CURRENT_DATE`)),
      or(isNull(evidenceDocumentVersions.validThrough),
        gte(evidenceDocumentVersions.validThrough, sql`CURRENT_DATE`)),
    ))
    .orderBy(desc(evidenceDocumentVersions.verifiedAt));

  const seen = new Set<string>();
  return versions.filter(item => {
    if (seen.has(item.documentId)) return false;
    seen.add(item.documentId);
    return true;
  }).map(({ id, title, kind }) => ({ id, title, kind }));
}

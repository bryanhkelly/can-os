import { and, desc, eq, gte, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { evidenceDocuments, evidenceDocumentVersions } from "@/db/canonical-v301";
import { assertCapability, AuthorizationError, type CommandContext } from "@/domain/command-context";
import { blueprintDatabaseRole } from "@/domain/blueprint-database-role";

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
  const { owningOrganizationId } = blueprintReviewEvidenceInputSchema.parse(rawInput);
  if (!context.scope.organizationIds?.includes(owningOrganizationId)) {
    throw new AuthorizationError("Blueprint review evidence Organization scope");
  }

  const databaseRole = blueprintDatabaseRole(context, "blueprint_reviewer");
  return db.transaction(async tx => {
    await tx.execute(sql.raw(`SET LOCAL ROLE ${databaseRole}`));
    const versions = await tx.select({
    id: evidenceDocumentVersions.id,
    documentId: evidenceDocuments.id,
    kind: evidenceDocuments.kindCode,
    title: sql<string>`public.evidence_documents.title`,
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
  });
}

import { and, eq, gt, isNull, lte } from "drizzle-orm";
import type { Database } from "@/db/client";
import { documents, networkAgreements } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { assertVerifiedAgreementDocument, isNetworkAgreementActive } from "@/domain/network-agreement-policy";

/**
 * Transaction-independent, read-only contract gate. Never trust a membership alone:
 * the externally verified document, denomination and date window must still match.
 * Caller must first authorize its own actor and organization scope.
 */
export async function requireCurrentNetworkAgreement(
  database: Pick<Database, "select">,
  denominationOrganizationId: string,
  at = new Date(),
) {
  const agreements = await database.select({
    id: networkAgreements.id,
    validFrom: networkAgreements.validFrom,
    validThrough: networkAgreements.validThrough,
    revokedAt: networkAgreements.revokedAt,
    evidence: {
      subjectType: documents.subjectType, subjectId: documents.subjectId,
      category: documents.category, verifiedAt: documents.verifiedAt,
      verifiedByPersonId: documents.verifiedByPersonId,
      expiresAt: documents.expiresAt, metadata: documents.metadata,
    },
  }).from(networkAgreements)
    .innerJoin(documents, eq(networkAgreements.evidenceDocumentId, documents.id))
    .where(and(
      eq(networkAgreements.denominationOrganizationId, denominationOrganizationId),
      isNull(networkAgreements.revokedAt),
      lte(networkAgreements.validFrom, at),
      gt(networkAgreements.validThrough, at),
    ));
  for (const candidate of agreements) {
    if (!isNetworkAgreementActive(candidate, at)) continue;
    try {
      assertVerifiedAgreementDocument(candidate.evidence, denominationOrganizationId, at);
      return candidate.id;
    } catch (error) {
      if (!(error instanceof AuthorizationError)) throw error;
    }
  }
  throw new AuthorizationError("current independently verified denomination agreement");
}

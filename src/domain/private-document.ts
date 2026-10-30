import { and, eq, isNotNull, isNull, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { documents } from "@/db/schema/documents";

type PrivateDocumentSubject = {
  subjectType: string;
  subjectId: string | SQLWrapper;
  category: string;
  uploadedByPersonId?: string | SQLWrapper;
  sensitivityTier?: string;
};

/** Storage eligibility only; callers must authorize the resource and validate its object-key scope. */
export function verifiedPrivateDocumentPredicate(subject: PrivateDocumentSubject): SQL {
  return and(
    eq(documents.subjectType, subject.subjectType),
    eq(documents.subjectId, subject.subjectId),
    eq(documents.category, subject.category),
    subject.uploadedByPersonId !== undefined
      ? eq(documents.uploadedByPersonId, subject.uploadedByPersonId) : undefined,
    subject.sensitivityTier !== undefined
      ? eq(documents.sensitivityTier, subject.sensitivityTier) : undefined,
    eq(documents.storageProvider, "cloudflare_r2"),
    isNotNull(documents.verifiedAt),
    or(isNull(documents.expiresAt), sql`${documents.expiresAt} > now()`),
  )!;
}

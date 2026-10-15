/** Side-effect-free state transition rules for credential review.
 * Persistence layer must independently authenticate reviewer, verify scope and
 * write DomainEvent + AuditEvent in the same transaction.
 */
export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected" | "revoked";
export type VerificationDecision = "submit" | "approve" | "reject" | "revoke";
export type CredentialReview = {
  status: VerificationStatus;
  subjectPersonId: string;
  reviewedByPersonId?: string | null;
  evidenceDocumentId?: string | null;
  expiry?: Date | null;
  reviewerNote?: string | null;
};
export type CredentialReviewResult = CredentialReview & {
  status: VerificationStatus;
  verifiedAt: Date | null;
};
export function decideCredentialReview(
  record: CredentialReview,
  decision: VerificationDecision,
  actorPersonId: string,
  now: Date,
  note?: string,
): CredentialReviewResult {
  if (!actorPersonId) throw new Error("Authenticated reviewer required");
  if (decision !== "submit" && actorPersonId === record.subjectPersonId) throw new Error("Independent reviewer required");
  if (record.expiry && record.expiry <= now && decision === "approve") throw new Error("Expired credentials cannot be verified");
  const allowed: Record<VerificationDecision, VerificationStatus[]> = {
    submit: ["unverified", "rejected"],
    approve: ["pending"],
    reject: ["pending"],
    revoke: ["verified"],
  };
  if (!allowed[decision].includes(record.status)) throw new Error(`Invalid credential transition: ${record.status} → ${decision}`);
  if (decision === "approve" && !record.evidenceDocumentId) throw new Error("Evidence required for verification");
  if ((decision === "reject" || decision === "revoke") && !note?.trim()) throw new Error("Reviewer reason required");
  const status: VerificationStatus = decision === "submit" ? "pending" : decision === "approve" ? "verified" : decision === "reject" ? "rejected" : "revoked";
  return { ...record, status, reviewedByPersonId: decision === "submit" ? null : actorPersonId,
    verifiedAt: decision === "approve" ? now : null, reviewerNote: note?.trim() || null };
}

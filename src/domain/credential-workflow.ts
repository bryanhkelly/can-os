import { defineLifecycle } from "@/platform/lifecycle";

/** Side-effect-free state transition rules for credential review.
 * Persistence layer must independently authenticate reviewer, verify scope and
 * write DomainEvent + AuditEvent in the same transaction.
 */
export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected" | "revoked";
export type VerificationDecision = "submit" | "approve" | "reject" | "revoke";
export function credentialStatusFromDecision(decision: string | null | undefined): VerificationStatus {
  switch (decision) {
    case null:
    case undefined:
      return "unverified";
    case "submit":
      return "pending";
    case "approve":
      return "verified";
    case "reject":
      return "rejected";
    case "revoke":
      return "revoked";
    default:
      throw new Error(`Unsupported credential verification decision: ${decision}`);
  }
}
const credentialLifecycle = defineLifecycle<VerificationStatus, VerificationDecision>({
  states: ["unverified", "pending", "verified", "rejected", "revoked"],
  transitions: {
    submit: { from: ["unverified", "rejected"], to: "pending" },
    approve: { from: ["pending"], to: "verified" },
    reject: { from: ["pending"], to: "rejected" },
    revoke: { from: ["verified"], to: "revoked" },
  },
});
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
  if (!credentialLifecycle.can(record.status, decision)) throw new Error(`Invalid credential transition: ${record.status} → ${decision}`);
  if (decision === "approve" && !record.evidenceDocumentId) throw new Error("Evidence required for verification");
  if ((decision === "reject" || decision === "revoke") && !note?.trim()) throw new Error("Reviewer reason required");
  const status = credentialLifecycle.apply(record.status, decision);
  return { ...record, status, reviewedByPersonId: decision === "submit" ? null : actorPersonId,
    verifiedAt: decision === "approve" ? now : null, reviewerNote: note?.trim() || null };
}

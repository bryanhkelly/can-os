/** Shared award eligibility for noncredit training and verified enrichment.
 * This never changes an academic grade, grants credit, or issues a credential.
 * The database revalidates immutable source evidence at award time.
 */
export type CredentialKind = "completion_certificate" | "digital_badge";
export type AchievementSource =
  | {
      kind: "noncredit_completion";
      participantPersonId: string;
      providerOrganizationId: string;
      decisionId: string;
      latestOutcome: "completed" | "not_yet_completed" | "voided";
      isCurrentDecision: boolean;
    }
  | {
      kind: "verified_activity";
      participantPersonId: string;
      providerOrganizationId: string;
      evidenceVersionId: string | null;
      verifiedByPersonId: string | null;
      verifiedMinutes: number;
      minimumMinutes: number;
      registrationActive: boolean;
    };

export type AwardBlocker =
  | "definition_unpublished"
  | "issuer_mismatch"
  | "learner_mismatch"
  | "source_incomplete"
  | "evidence_unverified";

export function evaluateAchievementAward(input: {
  definitionPublished: boolean;
  issuerOrganizationId: string;
  recipientPersonId: string;
  source: AchievementSource;
}): { eligible: boolean; blockers: AwardBlocker[] } {
  const blockers: AwardBlocker[] = [];
  if (!input.definitionPublished) blockers.push("definition_unpublished");
  if (!input.issuerOrganizationId ||
    input.issuerOrganizationId !== input.source.providerOrganizationId) blockers.push("issuer_mismatch");
  if (!input.recipientPersonId ||
    input.recipientPersonId !== input.source.participantPersonId) blockers.push("learner_mismatch");
  if (input.source.kind === "noncredit_completion") {
    if (!input.source.decisionId || !input.source.isCurrentDecision ||
        input.source.latestOutcome !== "completed") blockers.push("source_incomplete");
  } else {
    if (!input.source.registrationActive ||
        !Number.isSafeInteger(input.source.minimumMinutes) || input.source.minimumMinutes < 0 ||
        !Number.isSafeInteger(input.source.verifiedMinutes) ||
        input.source.verifiedMinutes < input.source.minimumMinutes)
      blockers.push("source_incomplete");
    if (!input.source.evidenceVersionId || !input.source.verifiedByPersonId ||
        input.source.verifiedByPersonId === input.recipientPersonId)
      blockers.push("evidence_unverified");
  }
  return { eligible: blockers.length === 0, blockers };
}

/** A credential's public validity is determined from issuer decisions, never
 * merely from possession of an old PDF, PNG or badge assertion.
 */
export function credentialIsCurrent(input: {
  issued: boolean;
  revoked: boolean;
  sourceStillValid: boolean;
  legacyCertificateRevoked?: boolean;
  expiresAt?: Date | null;
  now: Date;
}): boolean {
  return input.issued && !input.revoked && input.sourceStillValid &&
    !input.legacyCertificateRevoked && Number.isFinite(input.now.getTime()) &&
    (!input.expiresAt ||
      (Number.isFinite(input.expiresAt.getTime()) &&
        input.expiresAt.getTime() > input.now.getTime()));
}

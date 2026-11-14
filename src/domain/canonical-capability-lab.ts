/** Presentation-only action availability. Canonical service authorization is decisive. */
export function noncreditLabActions(record: {
  trainingState: string;
  courseStatus: string;
  registrationStatus: string;
  assessmentVersionId: string | null;
  assessmentGrantStatus: string | null;
  assessmentAttemptId: string | null;
  assessmentAttemptState: string | null;
  hasProvisionalResult: boolean;
  finalizedResultId: string | null;
  policyId: string | null;
  policyRequiresAssessment: boolean;
  latestDecision: string | null;
}) {
  const active = record.courseStatus === "active" &&
    (record.registrationStatus === "registered" || record.registrationStatus === "active");
  return {
    provision: active && record.trainingState === "published" &&
      Boolean(record.assessmentVersionId) && !record.assessmentGrantStatus,
    finalize: active && record.trainingState === "published" &&
      record.assessmentGrantStatus === "approved" && record.hasProvisionalResult &&
      record.assessmentAttemptState === "scored" &&
      Boolean(record.assessmentAttemptId) && !record.finalizedResultId,
    complete: active && Boolean(record.policyId) && record.latestDecision !== "completed" &&
      (!record.policyRequiresAssessment || Boolean(record.finalizedResultId)),
  };
}

/**
 * Select presentation evidence deterministically across multiple grants and
 * assessment retries. Source queries are already constrained to provider-owned
 * noncredit participation. This is NOT an authorization or finalization decision.
 */
export type LabGrant = {
  id: string; courseAttemptId: string | null; status: string;
  validFrom: Date; validThrough: Date | null;
};
export type LabAssessmentAttempt = {
  id: string; grantId: string; state: string; createdAt: Date;
};
export type LabAssessmentResult = {
  id: string; attemptId: string; status: string; revision: number;
  outcome: string | null; supersedesId: string | null;
};

export function selectNoncreditLabAssessmentEvidence(
  grants: readonly LabGrant[],
  attempts: readonly LabAssessmentAttempt[],
  results: readonly LabAssessmentResult[],
  now: Date,
) {
  const orderedGrants = [...grants].sort((a, b) =>
    b.validFrom.getTime() - a.validFrom.getTime() || b.id.localeCompare(a.id));
  const current = orderedGrants.find(grant =>
    grant.status === "approved" && grant.validFrom <= now &&
    (grant.validThrough === null || grant.validThrough > now));
  const chosenGrant = current ?? orderedGrants[0];
  // Only currently approved access is actionable. Prior revoked grants may
  // remain part of the audit trail but must not drive Lab actions.
  const scopedAttempts = current ? attempts.filter(item => item.grantId === current.id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() ||
      b.id.localeCompare(a.id)) : [];
  const superseded = new Set(results.flatMap(row =>
    row.supersedesId ? [row.supersedesId] : []));
  const latestResult = (attemptId: string) => [...results]
    .filter(row => row.attemptId === attemptId && !superseded.has(row.id))
    .sort((a, b) => b.revision - a.revision)[0] ?? null;
  const toFinalize = scopedAttempts.find(item => item.state === "scored" &&
    latestResult(item.id)?.status === "provisional" &&
    latestResult(item.id)?.revision === 1);
  const latest = toFinalize ?? scopedAttempts[0] ?? null;
  const finalizedAttempt = scopedAttempts.find(item =>
    latestResult(item.id)?.status === "finalized");
  const finalized = finalizedAttempt ? latestResult(finalizedAttempt.id) : null;

  return {
    assessmentGrantStatus: chosenGrant?.status ?? null,
    assessmentAttemptId: latest?.id ?? null,
    assessmentAttemptState: latest?.state ?? null,
    hasProvisionalResult: Boolean(toFinalize),
    finalizedResultId: finalized?.id ?? null,
    finalizedOutcome: finalized?.outcome ?? null,
  };
}

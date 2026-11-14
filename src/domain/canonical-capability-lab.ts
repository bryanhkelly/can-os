/** Presentation-only action availability. Canonical service authorization is decisive. */
export function noncreditLabActions(record: {
  courseStatus: string;
  registrationStatus: string;
  assessmentVersionId: string | null;
  assessmentGrantStatus: string | null;
  assessmentAttemptId: string | null;
  assessmentAttemptState: string | null;
  finalizedResultId: string | null;
  policyId: string | null;
  policyRequiresAssessment: boolean;
  latestDecision: string | null;
}) {
  const active = record.courseStatus === "active" &&
    (record.registrationStatus === "registered" || record.registrationStatus === "active");
  return {
    provision: active && Boolean(record.assessmentVersionId) && !record.assessmentGrantStatus,
    finalize: active && record.assessmentAttemptState === "scored" &&
      Boolean(record.assessmentAttemptId) && !record.finalizedResultId,
    complete: active && Boolean(record.policyId) && record.latestDecision !== "completed" &&
      (!record.policyRequiresAssessment || Boolean(record.finalizedResultId)),
  };
}

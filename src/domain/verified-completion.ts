/**
 * WS3 governed completion predicates. This is NOT a completion/award writer.
 * All evidence must come from authoritative, access-controlled readers.
 * A UI milestone, room playback or submitted quiz never becomes an award.
 */
export type CompletionScope = {
  participantPersonId: string;
  courseAttemptId: string;
  courseVersionId: string;
  classEnrollmentId: string | null;
};
export type PublishedCompletionPolicy = {
  id: string;
  courseVersionId: string;
  published: boolean;
  authorPersonId: string;
  approvedByPersonId: string;
  effectiveAt: Date;
  requireAllLessons: boolean;
  requiredVerifiedSessions: number;
  requirePassingAssessment: boolean;
};
export type VerifiedSessionEvidence = {
  id: string;
  sessionId: string;
  courseAttemptId: string;
  participantPersonId: string;
  evidenceVersionId: string | null;
  verifiedByPersonId: string | null;
  verifiedAt: Date | null;
  occurredAt: Date;
  supersedesId: string | null;
};
export type CanonicalAssessmentResult = {
  id: string;
  courseAttemptId: string;
  courseVersionId: string;
  participantPersonId: string;
  attemptState: string;
  resultStatus: string;
  outcome: string | null;
  reviewedByPersonId: string | null;
  supersedesId: string | null;
};
export type CompletionBlocker =
  | "inactive_participation" | "policy_unavailable" | "policy_not_pinned"
  | "lessons_incomplete" | "attendance_unverified" | "assessment_not_passed";
export type CompletionReadiness = {
  readyForIndependentReview: boolean;
  blockers: CompletionBlocker[];
  completedLessons: number;
  totalLessons: number;
  verifiedSessions: number;
  passingResultIds: string[];
  /** No decision is issued by this pure evaluator. */
  verifiedCompletion: false;
};

function dateValid(date: Date | null, now: Date): date is Date {
  return date instanceof Date && Number.isFinite(date.getTime()) &&
    date.getTime() <= now.getTime();
}

/** Fail closed if the independent published policy is missing or unpinned. */
export function evaluateCourseCompletion(input: {
  scope: CompletionScope;
  participationStatus: string;
  pinnedPolicyId: string | null;
  policy: PublishedCompletionPolicy | null;
  allLessonIds: readonly string[];
  completedLessonIds: readonly string[];
  sessionEvidence: readonly VerifiedSessionEvidence[];
  assessmentResults: readonly CanonicalAssessmentResult[];
  now: Date;
}): CompletionReadiness {
  const { scope, policy, now } = input;
  const blockers: CompletionBlocker[] = [];
  if (!["active", "completed"].includes(input.participationStatus))
    blockers.push("inactive_participation");
  if (!dateValid(now, now) || !policy || !policy.published ||
      policy.courseVersionId !== scope.courseVersionId ||
      !dateValid(policy.effectiveAt, now) ||
      !policy.authorPersonId || !policy.approvedByPersonId ||
      policy.authorPersonId === policy.approvedByPersonId ||
      policy.approvedByPersonId === scope.participantPersonId ||
      !Number.isSafeInteger(policy.requiredVerifiedSessions) ||
      policy.requiredVerifiedSessions < 0 ||
      (!policy.requireAllLessons && policy.requiredVerifiedSessions === 0 &&
       !policy.requirePassingAssessment))
    blockers.push("policy_unavailable");
  if (!policy || !input.pinnedPolicyId || policy.id !== input.pinnedPolicyId)
    blockers.push("policy_not_pinned");

  const knownLessons = new Set(input.allLessonIds);
  const done = new Set(input.completedLessonIds.filter(id => knownLessons.has(id)));
  if (policy?.requireAllLessons &&
      (knownLessons.size === 0 || done.size !== knownLessons.size))
    blockers.push("lessons_incomplete");

  const replacedSessions = new Set(input.sessionEvidence.flatMap(e =>
    e.supersedesId ? [e.supersedesId] : []));
  const verified = new Set(input.sessionEvidence.filter(e =>
    !replacedSessions.has(e.id) && e.courseAttemptId === scope.courseAttemptId &&
    e.participantPersonId === scope.participantPersonId &&
    !!e.evidenceVersionId && !!e.verifiedByPersonId &&
    e.verifiedByPersonId !== scope.participantPersonId &&
    dateValid(e.verifiedAt, now) && dateValid(e.occurredAt, now)
  ).map(e => e.sessionId));
  if (policy && verified.size < policy.requiredVerifiedSessions)
    blockers.push("attendance_unverified");

  const replacedResults = new Set(input.assessmentResults.flatMap(r =>
    r.supersedesId ? [r.supersedesId] : []));
  const passing = input.assessmentResults.filter(r =>
    !replacedResults.has(r.id) &&
    r.courseAttemptId === scope.courseAttemptId &&
    r.courseVersionId === scope.courseVersionId &&
    r.participantPersonId === scope.participantPersonId &&
    r.attemptState === "finalized" && r.resultStatus === "finalized" &&
    r.outcome === "pass" && !!r.reviewedByPersonId &&
    r.reviewedByPersonId !== scope.participantPersonId
  ).map(r => r.id);
  if (policy?.requirePassingAssessment && passing.length === 0)
    blockers.push("assessment_not_passed");

  return {
    readyForIndependentReview: blockers.length === 0,
    blockers, completedLessons: done.size, totalLessons: knownLessons.size,
    verifiedSessions: verified.size, passingResultIds: passing,
    verifiedCompletion: false,
  };
}

/** A Program references verified component decisions, not their copied evidence.
 * Duplicate Courses/Classes may appear in a Program, but one component
 * authority and Person contributes at most once to an aggregation.
 */
export type ProgramComponentRequirement = {
  componentKey: string; // stable Program blueprint component identity
  required: boolean;
};
export type VerifiedComponentDecision = {
  componentKey: string;
  sourceKind: "class_outcome" | "noncredit_completion_decision" | "academic_section_outcome";
  sourceId: string;
  participantPersonId: string;
  final: boolean;
  completed: boolean;
  revoked: boolean;
};
export function evaluateProgramCompletion(input: {
  participantPersonId: string;
  requirements: readonly ProgramComponentRequirement[];
  decisions: readonly VerifiedComponentDecision[];
}): { readyForReview: boolean; satisfied: string[]; missing: string[]; conflicting: string[] } {
  const satisfied: string[] = [];
  const missing: string[] = [];
  const conflicting: string[] = [];
  const sourceClaims = new Map<string, string>();
  for (const requirement of input.requirements) {
    if (!requirement.required) continue;
    const candidates = input.decisions.filter(d =>
      d.componentKey === requirement.componentKey &&
      d.participantPersonId === input.participantPersonId);
    const current = candidates.filter(d => d.final && d.completed && !d.revoked);
    if (current.length !== 1) { missing.push(requirement.componentKey); continue; }
    const decision = current[0]!;
    const source = `${decision.sourceKind}:${decision.sourceId}`;
    if (!decision.sourceId || sourceClaims.has(source) ||
        candidates.some(d => d.revoked || !d.final || !d.completed)) {
      conflicting.push(requirement.componentKey);
      continue;
    }
    sourceClaims.set(source, requirement.componentKey);
    satisfied.push(requirement.componentKey);
  }
  return { readyForReview: missing.length === 0 && conflicting.length === 0 &&
    input.requirements.some(r => r.required), satisfied, missing, conflicting };
}

/** A recorded outcome is not an award. Issuance needs a separate capability
 * and independently approved policy; for-credit mode is not itself an award. */
export function evaluateAwardAuthority(input: {
  learnerPersonId: string;
  issuerPersonId: string;
  issuerOrganizationId: string;
  operatingOrganizationId: string;
  currentIndependentIssuerApproval: boolean;
  approvedPolicyEvidenceVersionId: string | null;
  verifiedCompletionDecisionId: string | null;
  enrollmentCreditMode: "for_credit" | "audit" | "not_applicable";
  awardKind: "academic_credit" | "certificate" | "credential" | "participation";
  academicIssuerApproved: boolean;
}): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!input.learnerPersonId || !input.issuerPersonId ||
      input.learnerPersonId === input.issuerPersonId)
    reasons.push("independent_issuer_required");
  if (!input.issuerOrganizationId ||
      input.issuerOrganizationId !== input.operatingOrganizationId)
    reasons.push("issuer_scope_mismatch");
  if (!input.currentIndependentIssuerApproval)
    reasons.push("issuer_approval_missing");
  if (!input.approvedPolicyEvidenceVersionId)
    reasons.push("approved_policy_missing");
  if (!input.verifiedCompletionDecisionId)
    reasons.push("verified_completion_missing");
  if (input.awardKind === "academic_credit" &&
      (input.enrollmentCreditMode !== "for_credit" ||
       !input.academicIssuerApproved))
    reasons.push("academic_credit_not_authorized");
  return { allowed: reasons.length === 0, reasons };
}

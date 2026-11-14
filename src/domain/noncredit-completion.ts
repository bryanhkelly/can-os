/**
 * Pure readiness evaluation for the existing canonical noncredit completion
 * policy. This NEVER writes a completion decision, transcript, certificate or
 * credit. A designated authorized provider must issue the final decision.
 */
export type NoncreditCompletionPolicy = {
  trainingVersionId: string;
  effectiveAt: Date;
  minParticipationMinutes: number;
  skillsAssessmentRequired: boolean;
  minimumAssessmentFraction: number | null;
};
export type NoncreditParticipationEvidence = {
  id: string;
  supersedesId: string | null;
  eventKind: "lesson_completed" | "session_attended" | "skill_practiced" | "activity_completed" | "attendance_corrected";
  countedMinutes: number;
  evidenceVersionId: string | null;
};
export type NoncreditAssessmentEvidence = {
  learnerId: string | null;
  assessmentVersionId: string;
  resultStatus: "draft" | "finalized" | "voided";
  pointsEarned: number;
  pointsPossible: number;
};
export type NoncreditCompletionReadiness = {
  eligible: boolean;
  countedMinutes: number;
  requiredMinutes: number;
  assessmentFraction: number | null;
  blockers: ("registration_inactive" | "policy_unavailable" | "participation_incomplete" | "assessment_incomplete")[];
};

export function evaluateNoncreditCompletion(input: {
  registrationStatus: string;
  trainingVersionId: string;
  trainingState: string;
  learnerId: string | null;
  assessmentVersionId: string | null;
  policy: NoncreditCompletionPolicy | null;
  participation: readonly NoncreditParticipationEvidence[];
  assessment: NoncreditAssessmentEvidence | null;
  now: Date;
}): NoncreditCompletionReadiness {
  const blockers: NoncreditCompletionReadiness["blockers"] = [];
  if (!["active", "registered"].includes(input.registrationStatus) ||
      input.trainingState !== "published") blockers.push("registration_inactive");
  const p = input.policy;
  if (!p || p.trainingVersionId !== input.trainingVersionId ||
      !Number.isFinite(input.now.getTime()) || !Number.isFinite(p.effectiveAt.getTime()) ||
      p.effectiveAt > input.now || !Number.isSafeInteger(p.minParticipationMinutes) ||
      p.minParticipationMinutes < 0 || (p.skillsAssessmentRequired &&
      (p.minimumAssessmentFraction === null || !Number.isFinite(p.minimumAssessmentFraction) ||
       p.minimumAssessmentFraction < 0 || p.minimumAssessmentFraction > 1))) {
    blockers.push("policy_unavailable");
  }
  const superseded = new Set(input.participation.map(e => e.supersedesId).filter((id): id is string => !!id));
  // A progress tick, media click or elapsed page time is never counted evidence.
  // Database provenance rules require an attributable evidence version for counted minutes.
  const countedMinutes = input.participation.reduce((sum, event) => {
    if (superseded.has(event.id) || event.eventKind === "attendance_corrected" ||
        !event.evidenceVersionId || !Number.isSafeInteger(event.countedMinutes) ||
        event.countedMinutes < 0) return sum;
    return sum + event.countedMinutes;
  }, 0);
  if (p && countedMinutes < p.minParticipationMinutes) blockers.push("participation_incomplete");
  const a = input.assessment;
  const validAssessment = !!a && !!input.learnerId && !!input.assessmentVersionId &&
    a.learnerId === input.learnerId && a.assessmentVersionId === input.assessmentVersionId &&
    a.resultStatus === "finalized" && Number.isFinite(a.pointsEarned) &&
    Number.isFinite(a.pointsPossible) && a.pointsPossible > 0 &&
    a.pointsEarned >= 0 && a.pointsEarned <= a.pointsPossible;
  const assessmentFraction = validAssessment && a ? a.pointsEarned / a.pointsPossible : null;
  if (p?.skillsAssessmentRequired && (assessmentFraction === null ||
      assessmentFraction < (p.minimumAssessmentFraction ?? 1))) blockers.push("assessment_incomplete");
  return {
    eligible: blockers.length === 0, countedMinutes,
    requiredMinutes: p?.minParticipationMinutes ?? 0,
    assessmentFraction, blockers,
  };
}

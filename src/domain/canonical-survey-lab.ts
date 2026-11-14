/**
 * Configuration-only preflight for an IDENTIFIED noncredit survey campaign.
 * This never grants access, publishes content, or certifies survey delivery.
 * Learner access is still checked by the owned course-survey server workflow.
 */
export type SurveyPreflightInput = {
  campaignStatus: string;
  responseMode: string;
  startsAt: Date;
  endsAt: Date | null;
  permissionEvidenceId: string | null;
  deploymentId: string | null;
  definitionStatus: string;
  audience: string;
  versionLifecycle: string;
  questionCount: number;
  loadedQuestionCount: number;
  hasMoreOptions: boolean;
  branchRuleCount: number;
  sentInvitationCount: number;
  questions: readonly {
    questionType: string;
    safetyTriage: boolean;
    ratingMin: number | null;
    ratingMax: number | null;
    optionCount: number;
  }[];
};
export type SurveyPreflight = {
  compatible: boolean;
  blockers: string[];
};

/** Deliberately narrower than the full dynamic survey engine. */
export function inspectIdentifiedNoncreditSurvey(
  input: SurveyPreflightInput,
  now: Date,
): SurveyPreflight {
  const blockers: string[] = [];
  if (input.campaignStatus !== "active") blockers.push("Campaign is not active");
  if (input.responseMode !== "identified") blockers.push("Noncredit learner flow supports identified responses only");
  if (input.startsAt > now || (input.endsAt !== null && input.endsAt <= now))
    blockers.push("Campaign is outside its active date window");
  if (!input.permissionEvidenceId) blockers.push("Survey permission evidence is missing");
  if (!input.deploymentId) blockers.push("No deployment is attached");
  if (input.definitionStatus !== "active") blockers.push("Survey definition is not active");
  if (input.versionLifecycle !== "published") blockers.push("Survey version is not published");
  if (!["learner", "any"].includes(input.audience))
    blockers.push("Survey audience does not include learners");
  if (input.questionCount < 1 || input.questionCount > 100)
    blockers.push("Learner flow requires 1 to 100 questions");
  if (input.loadedQuestionCount !== input.questionCount || input.hasMoreOptions)
    blockers.push("Complete question and option inspection is unavailable");
  if (input.branchRuleCount > 0) blockers.push("Branching requires dedicated survey support");
  if (input.questions.some(q => q.safetyTriage))
    blockers.push("Safeguarding triage requires protected response processing");
  if (input.questions.some(q => q.questionType === "matrix"))
    blockers.push("Matrix questions require dedicated response support");
  if (input.questions.some(q =>
    (q.questionType === "single_choice" || q.questionType === "multiple_choice") &&
    q.optionCount < 1))
    blockers.push("Choice questions need selectable options");
  if (input.questions.some(q =>
    ["rating", "likert", "nps"].includes(q.questionType) &&
    (q.ratingMin === null || q.ratingMax === null || q.ratingMin > q.ratingMax)))
    blockers.push("Rating questions need a valid numeric range");
  if (input.questions.some(q => q.questionType === "nps" &&
    (q.ratingMin !== 0 || q.ratingMax !== 10)))
    blockers.push("Net promoter score requires a 0 to 10 range");
  if (input.questions.some(q =>
    !["single_choice", "multiple_choice", "rating", "likert", "nps", "text", "matrix"]
      .includes(q.questionType)))
    blockers.push("Unrecognized question type");
  if (input.sentInvitationCount < 1) blockers.push("No personal invitations have been sent");
  return { compatible: blockers.length === 0, blockers };
}

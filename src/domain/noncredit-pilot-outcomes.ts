/**
 * Noncredit pilot outcomes. These are operational facts, not academic grades,
 * formal credentials, license claims or evidence of video watch time.
 *
 * Never infer a completed training from lesson ticks or a passed knowledge check.
 * Only the latest authoritative noncredit_completion_decision counts.
 */
/**
 * One completed feedback response can be credited to a training only when
 * the server has verified its exact Person, Deployment, Offering and
 * operating Organization. No deployment-wide survey or repeated registration
 * can be inferred as course feedback.
 */
export function attributableNoncreditFeedback(input: {
  offeringId: string | null;
  registrationsForPersonOffering: number;
  registeredAt: Date;
  latestSubmittedAt: Date | null;
}): boolean {
  return !!input.offeringId &&
    input.registrationsForPersonOffering === 1 &&
    Number.isFinite(input.registeredAt.getTime()) &&
    input.latestSubmittedAt !== null &&
    Number.isFinite(input.latestSubmittedAt.getTime()) &&
    input.latestSubmittedAt >= input.registeredAt;
}

/**
 * National and cross-Site reach is a distinct-Person count, not the number of
 * registrations or Course Attempts. Returns an aggregate only; identities
 * never leave the authorized server report.
 */
export function countDistinctNoncreditLearners(personIds:readonly string[]):number {
  const unique=new Set<string>();
  for(const personId of personIds){
    if(!personId)throw new Error("Noncredit reach requires canonical Person identity");
    unique.add(personId);
  }
  return unique.size;
}

export type PilotParticipantFact = {
  registrationId:string;
  trainingVersionId:string;
  registered:boolean;
  engaged:boolean;
  completedLessonCount:number;
  totalLessonCount:number;
  knowledgeSubmitted:boolean;
  knowledgeResult:"pass"|"fail"|"inconclusive"|null;
  surveySubmitted:boolean;
  completionRecorded:boolean;
  /** Source-verified, current non-superseded participation minutes only. */
  verifiedParticipationMinutes?:number;
  baselineFraction:number|null;
  finalFraction:number|null;
};

export type PilotOutcomeSummary = {
  registrations:number;
  verifiedParticipationMinutes:number;
  engagedParticipants:number;
  participantsWithCompletedLessons:number;
  lessonsMarkedComplete:number;
  knowledgeCheckSubmissions:number;
  knowledgeCheckPasses:number;
  knowledgeCheckFailures:number;
  surveyRespondents:number;
  confirmedNoncreditCompletions:number;
  pairedKnowledgeChecks:number;
  averagePreKnowledgeFraction:number|null;
  averagePostKnowledgeFraction:number|null;
  averageImprovementPercentagePoints:number|null;
};

/**
 * Stable metric definitions for the current private noncredit pilot read model.
 * These prepare a future shared Insights registry without creating new
 * enrollment authorities, participant states or public reporting rights.
 */
export const NONCREDIT_PILOT_COUNT_DEFINITIONS = [
  {key:"distinctLearners",label:"Unique learners",
    source:"noncredit_registrations + approved Site release claims",
    denominator:"Distinct canonical Person IDs",timeBasis:"registered_at",
    rule:"Deduplicated across the provider's authorized Site releases and training versions."},
  {key:"verifiedParticipationMinutes",label:"Verified participation minutes",
    source:"noncredit_participation_events + verified evidence_document_versions",
    denominator:"Registration-linked, unsuperseded evidence events",timeBasis:"Registration cohort, evidence current at report generation",
    rule:"Sum source-verified minutes; not elapsed browser time, watch time or deduplicated person time."},
  {key:"registrations",label:"Training registrations",
    source:"noncredit_registrations + noncredit_self_enrollment_claims",
    denominator:"Registration IDs",timeBasis:"registered_at",
    rule:"Registrations include repeat registrations by the same Person."},
  {key:"engagedParticipants",label:"Engaged registrations",
    source:"learner_lesson_progress + noncredit_participation_events + assessment attempts",
    denominator:"Registration IDs",timeBasis:"registration cohort with observed activity",
    rule:"A completed lesson, submitted check or participation event; not verified attendance."},
  {key:"lessonsMarkedComplete",label:"Lessons marked complete",
    source:"learner_lesson_progress",denominator:"Completed lesson records",
    timeBasis:"registration cohort with observed progress",
    rule:"Sum of completed lessons; not verified Program completion."},
  {key:"knowledgeCheckSubmissions",label:"Registrations with a knowledge check",
    source:"assessment_execution_attempts",denominator:"Registration IDs",
    timeBasis:"registration cohort with assessment submission",
    rule:"A registration with a submitted knowledge check; not a credential."},
  {key:"knowledgeCheckPasses",label:"Passed final knowledge checks",
    source:"assessment_execution_results",denominator:"Registration IDs",
    timeBasis:"registration cohort with finalized assessment",
    rule:"Passing finalized result; not academic credit."},
  {key:"surveyRespondents",label:"Registrations with feedback",
    source:"survey_campaigns + survey_invitations + survey_responses",
    denominator:"Attributable registration IDs",
    timeBasis:"registration cohort with verified survey response",
    rule:"Identified response must match Person, Offering, Deployment and operator without ambiguous retakes."},
  {key:"confirmedNoncreditCompletions",label:"Confirmed completions",
    source:"noncredit_completion_decisions",denominator:"Registration IDs",
    timeBasis:"registration cohort with current governing decision",
    rule:"Latest authoritative, unsuperseded completed decision only."},
  {key:"pairedKnowledgeChecks",label:"Paired before/after checks",
    source:"assessment_execution_results",
    denominator:"Registration IDs with valid diagnostic pairs",
    timeBasis:"registration cohort with comparable assessment pair",
    rule:"Valid baseline and final checks for the same registration; denominator for measured learning change."},
] as const;

export function summarizeNoncreditPilot(facts:readonly PilotParticipantFact[]):PilotOutcomeSummary {
  const seen=new Set<string>();
  const totals:PilotOutcomeSummary={
    registrations:0,verifiedParticipationMinutes:0,engagedParticipants:0,participantsWithCompletedLessons:0,
    lessonsMarkedComplete:0,knowledgeCheckSubmissions:0,
    knowledgeCheckPasses:0,knowledgeCheckFailures:0,surveyRespondents:0,
    confirmedNoncreditCompletions:0,pairedKnowledgeChecks:0,
    averagePreKnowledgeFraction:null,averagePostKnowledgeFraction:null,
    averageImprovementPercentagePoints:null,
  };
  let baseline=0,followup=0;
  for(const fact of facts){
    if(seen.has(fact.registrationId))throw new Error("Duplicate pilot registration fact");
    seen.add(fact.registrationId);
    if(!Number.isSafeInteger(fact.completedLessonCount)||fact.completedLessonCount<0||
       !Number.isSafeInteger(fact.totalLessonCount)||fact.totalLessonCount<0||
       fact.completedLessonCount>fact.totalLessonCount)
      throw new Error("Invalid noncredit lesson progress");
    const minutes=fact.verifiedParticipationMinutes??0;
    if(!Number.isSafeInteger(minutes)||minutes<0)throw new Error("Invalid verified participation minutes");
    totals.verifiedParticipationMinutes+=minutes;
    if(!Number.isSafeInteger(totals.verifiedParticipationMinutes))throw new Error("Participation minute total exceeds safe integer range");
    totals.registrations+=fact.registered?1:0;
    totals.engagedParticipants+=fact.engaged?1:0;
    totals.participantsWithCompletedLessons+=fact.completedLessonCount>0?1:0;
    totals.lessonsMarkedComplete+=fact.completedLessonCount;
    totals.knowledgeCheckSubmissions+=fact.knowledgeSubmitted?1:0;
    totals.knowledgeCheckPasses+=fact.knowledgeResult==="pass"?1:0;
    totals.knowledgeCheckFailures+=fact.knowledgeResult==="fail"?1:0;
    totals.surveyRespondents+=fact.surveySubmitted?1:0;
    totals.confirmedNoncreditCompletions+=fact.completionRecorded?1:0;
    const pre=fact.baselineFraction,post=fact.finalFraction;
    if(pre!==null&&post!==null&&Number.isFinite(pre)&&Number.isFinite(post)&&
       pre>=0&&pre<=1&&post>=0&&post<=1){
      totals.pairedKnowledgeChecks++;
      baseline+=pre;followup+=post;
    }
  }
  if(totals.pairedKnowledgeChecks>0){
    totals.averagePreKnowledgeFraction=baseline/totals.pairedKnowledgeChecks;
    totals.averagePostKnowledgeFraction=followup/totals.pairedKnowledgeChecks;
    totals.averageImprovementPercentagePoints=
      (followup-baseline)/totals.pairedKnowledgeChecks*100;
  }
  return totals;
}

/**
 * Public-facing/partner summaries should not expose small cohorts or
 * potentially identifying per-learner detail.
 */
export function publicationSafePilotSummary(summary:PilotOutcomeSummary,minimumCell=10){
  if(!Number.isSafeInteger(minimumCell)||minimumCell<5)
    throw new Error("Invalid confidentiality cell threshold");
  if(summary.registrations<minimumCell)
    return {publishable:false,minimumCell,summary:null};
  return {publishable:true,minimumCell,summary:{
    registrations:summary.registrations,
    engagedParticipants:summary.engagedParticipants<minimumCell?null:summary.engagedParticipants,
    knowledgeCheckSubmissions:summary.knowledgeCheckSubmissions<minimumCell?null:summary.knowledgeCheckSubmissions,
    knowledgeCheckPasses:summary.knowledgeCheckPasses<minimumCell?null:summary.knowledgeCheckPasses,
    surveyRespondents:summary.surveyRespondents<minimumCell?null:summary.surveyRespondents,
    confirmedNoncreditCompletions:summary.confirmedNoncreditCompletions<minimumCell?null:summary.confirmedNoncreditCompletions,
    pairedKnowledgeChecks:summary.pairedKnowledgeChecks<minimumCell?null:summary.pairedKnowledgeChecks,
    averageImprovementPercentagePoints:summary.pairedKnowledgeChecks>=minimumCell
      ?summary.averageImprovementPercentagePoints:null,
  }};
}

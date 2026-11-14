/**
 * Noncredit pilot outcomes. These are operational facts, not academic grades,
 * formal credentials, license claims or evidence of video watch time.
 *
 * Never infer a completed training from lesson ticks or a passed knowledge check.
 * Only the latest authoritative noncredit_completion_decision counts.
 */
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
  baselineFraction:number|null;
  finalFraction:number|null;
};

export type PilotOutcomeSummary = {
  registrations:number;
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

export function summarizeNoncreditPilot(facts:readonly PilotParticipantFact[]):PilotOutcomeSummary {
  const seen=new Set<string>();
  const totals:PilotOutcomeSummary={
    registrations:0,engagedParticipants:0,participantsWithCompletedLessons:0,
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

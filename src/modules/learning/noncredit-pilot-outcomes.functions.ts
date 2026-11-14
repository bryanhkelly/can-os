import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  noncreditRegistrations,noncreditTrainingVersions,learnerCourseAttempts,
  learnerLessonProgress,courseLessons,assessmentAccess,
  assessmentExecutionAttempts,assessmentExecutionResults,
  assessmentFormAdministrations,noncreditCompletionDecisions,
  surveyInvitations,surveyCampaigns,surveyResponses,noncreditParticipationEvents,
} from "@/db/canonical-v301";
import {
  summarizeNoncreditPilot,publicationSafePilotSummary,
  type PilotParticipantFact,
} from "@/domain/noncredit-pilot-outcomes";
import { requireCanonicalLabProvider } from "@/modules/operations/canonical-capability-lab-access.server";

/**
 * Scoped operational reporting, not a public annual-report endpoint.
 * Exposes aggregated outcomes to the authorized provider only; participant
 * identity and raw questionnaire answers are never returned.
 */
const params=z.object({
  from:z.string().datetime({offset:true}).optional(),
  to:z.string().datetime({offset:true}).optional(),
}).strict();
const uuidSet=(values:(string|null)[])=>[...new Set(values.filter((x):x is string=>!!x))];
const take=5001;
function checkBound(n:number,name:string){
  if(n>=take)throw new Error(name+" exceeds interactive report limit; use partitioned reporting");
}
export const getNoncreditPilotOutcomes=createServerFn({method:"GET"})
  .validator((value:unknown)=>params.parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const {organizationId}=await requireCanonicalLabProvider();
    const to=data.to?new Date(data.to):new Date();
    const from=data.from?new Date(data.from):new Date(to.getTime()-90*86400000);
    if(!(to>from)||to.getTime()-from.getTime()>366*86400000)
      throw new Error("Pilot reporting must use a positive range of no more than 366 days");
    const trainings=await db.select({
      id:noncreditTrainingVersions.id,title:noncreditTrainingVersions.title,
      finalAssessmentVersionId:noncreditTrainingVersions.assessmentVersionId,
      baselineAssessmentVersionId:noncreditTrainingVersions.baselineAssessmentVersionId,
    }).from(noncreditTrainingVersions)
      .where(eq(noncreditTrainingVersions.providerOrganizationId,organizationId))
      .orderBy(asc(noncreditTrainingVersions.title));
    if(!trainings.length)return {
      from:from.toISOString(),to:to.toISOString(),participantCount:0,
      totals:summarizeNoncreditPilot([]),byTraining:[],
      publicationSafe:publicationSafePilotSummary(summarizeNoncreditPilot([])),
    };
    const registrations=await db.select({
      id:noncreditRegistrations.id,
      trainingVersionId:noncreditRegistrations.trainingVersionId,
      status:noncreditRegistrations.status,
      participantPersonId:noncreditRegistrations.participantPersonId,
      deploymentId:noncreditRegistrations.deploymentId,
    }).from(noncreditRegistrations)
      .where(and(
        inArray(noncreditRegistrations.trainingVersionId,trainings.map(t=>t.id)),
        gte(noncreditRegistrations.registeredAt,from),
        lt(noncreditRegistrations.registeredAt,to),
      )).limit(take);
    checkBound(registrations.length,"Noncredit registrations");
    const registrationIds=registrations.map(r=>r.id);
    if(!registrationIds.length){
      const empty=summarizeNoncreditPilot([]);
      return {from:from.toISOString(),to:to.toISOString(),participantCount:0,
        totals:empty,byTraining:[],publicationSafe:publicationSafePilotSummary(empty)};
    }
    const attempts=await db.select({
      id:learnerCourseAttempts.id,registrationId:learnerCourseAttempts.noncreditRegistrationId,
      courseVersionId:learnerCourseAttempts.courseVersionId,
    }).from(learnerCourseAttempts)
      .where(and(inArray(learnerCourseAttempts.noncreditRegistrationId,registrationIds),
        eq(learnerCourseAttempts.status,"active"))).limit(take);
    checkBound(attempts.length,"Course attempts");
    const courseIds=attempts.map(row=>row.id);
    const versions=uuidSet(attempts.map(row=>row.courseVersionId));
    const [lessons,progress,grants,decisions,participationEvents]=await Promise.all([
      versions.length?db.select({id:courseLessons.id,courseVersionId:courseLessons.courseVersionId})
        .from(courseLessons).where(inArray(courseLessons.courseVersionId,versions)):[],
      courseIds.length?db.select({
        courseAttemptId:learnerLessonProgress.courseAttemptId,
        lessonId:learnerLessonProgress.lessonId,status:learnerLessonProgress.status,
      }).from(learnerLessonProgress)
        .where(inArray(learnerLessonProgress.courseAttemptId,courseIds)):[],
      courseIds.length?db.select({
        id:assessmentAccess.id,courseAttemptId:assessmentAccess.courseAttemptId,
      }).from(assessmentAccess)
        .where(inArray(assessmentAccess.courseAttemptId,courseIds)):[],
      db.select({
        id:noncreditCompletionDecisions.id,
        registrationId:noncreditCompletionDecisions.registrationId,
        outcome:noncreditCompletionDecisions.outcome,
        supersedesId:noncreditCompletionDecisions.supersedesId,
        decidedAt:noncreditCompletionDecisions.decidedAt,
      }).from(noncreditCompletionDecisions)
        .where(inArray(noncreditCompletionDecisions.registrationId,registrationIds))
        .orderBy(desc(noncreditCompletionDecisions.decidedAt)),
      db.select({
        registrationId:noncreditParticipationEvents.registrationId,
      }).from(noncreditParticipationEvents)
        .where(inArray(noncreditParticipationEvents.registrationId,registrationIds)),
    ]);
    const grantIds=grants.map(g=>g.id);
    const checkAttempts=grantIds.length?await db.select({
      id:assessmentExecutionAttempts.id,grantId:assessmentExecutionAttempts.accessGrantId,
      administrationId:assessmentExecutionAttempts.administrationId,
      state:assessmentExecutionAttempts.state,
      submittedAt:assessmentExecutionAttempts.submittedAt,
    }).from(assessmentExecutionAttempts)
      .where(inArray(assessmentExecutionAttempts.accessGrantId,grantIds)):[];
    const checkIds=checkAttempts.map(a=>a.id);
    const adminIds=uuidSet(checkAttempts.map(a=>a.administrationId));
    const [results,administrations]=await Promise.all([
      checkIds.length?db.select({
        id:assessmentExecutionResults.id,
        attemptId:assessmentExecutionResults.attemptId,
        status:assessmentExecutionResults.resultStatus,
        outcome:assessmentExecutionResults.outcome,
        earned:assessmentExecutionResults.pointsEarned,
        possible:assessmentExecutionResults.pointsPossible,
        revision:assessmentExecutionResults.resultRevision,
        supersedesId:assessmentExecutionResults.supersedesId,
      }).from(assessmentExecutionResults)
        .where(inArray(assessmentExecutionResults.attemptId,checkIds)):[],
      adminIds.length?db.select({
        id:assessmentFormAdministrations.id,
        assessmentVersionId:assessmentFormAdministrations.assessmentVersionId,
      }).from(assessmentFormAdministrations)
        .where(inArray(assessmentFormAdministrations.id,adminIds)):[],
    ]);
    const people=uuidSet(registrations.map(r=>r.participantPersonId));
    const deployments=uuidSet(registrations.map(r=>r.deploymentId));
    const surveys=people.length&&deployments.length?await db.select({
      personId:surveyInvitations.invitedPersonId,
      deploymentId:surveyCampaigns.deploymentId,
    }).from(surveyResponses)
      .innerJoin(surveyInvitations,eq(surveyResponses.invitationId,surveyInvitations.id))
      .innerJoin(surveyCampaigns,eq(surveyInvitations.campaignId,surveyCampaigns.id))
      .where(and(
        inArray(surveyInvitations.invitedPersonId,people),
        inArray(surveyCampaigns.deploymentId,deployments),
        eq(surveyResponses.respondentMode,"identified"),
      )):[];
    // If one person has multiple registrations in the same deployment,
    // survey attribution is ambiguous; do not double-count as course feedback.
    const registrationCounts=new Map<string,number>();
    for(const r of registrations){
      const key=r.deploymentId+":"+r.participantPersonId;
      registrationCounts.set(key,(registrationCounts.get(key)??0)+1);
    }
    const surveyedKeys=new Set(surveys.map(s=>s.deploymentId+":"+s.personId));
    const attemptById=new Map(attempts.map(a=>[a.id,a]));
    const grantsById=new Map(grants.map(g=>[g.id,g]));
    const adminById=new Map(administrations.map(a=>[a.id,a]));
    const supersededResults=new Set(results.flatMap(r=>r.supersedesId?[r.supersedesId]:[]));
    const latestResults=results.filter(r=>!supersededResults.has(r.id)&&r.status==="finalized");
    const supersededDecisions=new Set(decisions.flatMap(d=>d.supersedesId?[d.supersedesId]:[]));
    const currentDecisions=decisions.filter(d=>!supersededDecisions.has(d.id));
    const trainingById=new Map(trainings.map(t=>[t.id,t]));
    const facts:PilotParticipantFact[]=registrations.map(reg=>{
      const ownAttempts=attempts.filter(a=>a.registrationId===reg.id);
      const ownAttemptIds=new Set(ownAttempts.map(a=>a.id));
      const relevantLessons=new Set(ownAttempts.flatMap(a=>
        lessons.filter(l=>l.courseVersionId===a.courseVersionId).map(l=>l.id)));
      const doneLessons=new Set(progress.filter(p=>ownAttemptIds.has(p.courseAttemptId)
        &&p.status==="completed"&&relevantLessons.has(p.lessonId)).map(p=>p.lessonId));
      const ownChecks=checkAttempts.filter(c=>{
        const g=grantsById.get(c.grantId);
        return !!g&&g.courseAttemptId!==null&&ownAttemptIds.has(g.courseAttemptId);
      });
      const training=trainingById.get(reg.trainingVersionId);
      const finalCheck=ownChecks.filter(c=>adminById.get(c.administrationId)?.assessmentVersionId===
        training?.finalAssessmentVersionId);
      const baselineCheck=ownChecks.filter(c=>!!training?.baselineAssessmentVersionId &&
        adminById.get(c.administrationId)?.assessmentVersionId===
          training.baselineAssessmentVersionId);
      const finalCheckIds=new Set(finalCheck.map(c=>c.id));
      const finalResults=latestResults.filter(r=>finalCheckIds.has(r.attemptId) &&
        Number(r.possible)>0).sort((a,b)=>Number(b.earned)/Number(b.possible)-
                                                 Number(a.earned)/Number(a.possible));
      // Learning gain uses the first finalized baseline and first finalized
      // post-check in time order, never the learner's best retake.
      const checkById=new Map(ownChecks.map(c=>[c.id,c]));
      const firstFinal=finalResults.filter(r=>checkById.get(r.attemptId)?.submittedAt)
        .sort((a,b)=>checkById.get(a.attemptId)!.submittedAt!.getTime()-
                     checkById.get(b.attemptId)!.submittedAt!.getTime())[0];
      const firstBaseline=latestResults.filter(r=>
        baselineCheck.some(check=>check.id===r.attemptId) &&
        Number(r.possible)>0 && checkById.get(r.attemptId)?.submittedAt)
        .sort((a,b)=>checkById.get(a.attemptId)!.submittedAt!.getTime()-
                     checkById.get(b.attemptId)!.submittedAt!.getTime())[0];
      const paired=!!firstBaseline&&!!firstFinal&&
        checkById.get(firstBaseline.attemptId)!.submittedAt!<
        checkById.get(firstFinal.attemptId)!.submittedAt!;
      const passed=finalResults.find(r=>r.outcome==="pass");
      const currentDecision=currentDecisions.find(d=>d.registrationId===reg.id);
      const surveyKey=reg.deploymentId+":"+reg.participantPersonId;
      const hasSubmitted=finalCheck.some(c=>c.submittedAt!==null);
      return {
        registrationId:reg.id,trainingVersionId:reg.trainingVersionId,registered:true,
        engaged:doneLessons.size>0||hasSubmitted||
          participationEvents.some(e=>e.registrationId===reg.id),
        completedLessonCount:doneLessons.size,totalLessonCount:relevantLessons.size,
        knowledgeSubmitted:hasSubmitted,
        knowledgeResult:passed?"pass":finalResults[0]?.outcome??null,
        surveySubmitted:registrationCounts.get(surveyKey)===1&&surveyedKeys.has(surveyKey),
        completionRecorded:currentDecision?.outcome==="completed",
        baselineFraction:paired?Number(firstBaseline.earned)/Number(firstBaseline.possible):null,
        finalFraction:paired?Number(firstFinal.earned)/Number(firstFinal.possible):null,
      };
    });
    const byTraining=trainings.map(t=>{
      const subset=facts.filter(f=>f.trainingVersionId===t.id);
      if(!subset.length)return null;
      const summary=summarizeNoncreditPilot(subset);
      return {trainingVersionId:t.id,title:t.title,summary,
        publicationSafe:publicationSafePilotSummary(summary)};
    }).filter((r):r is NonNullable<typeof r>=>r!==null);
    const totals=summarizeNoncreditPilot(facts);
    return {from:from.toISOString(),to:to.toISOString(),
      participantCount:registrations.length,totals,byTraining,
      publicationSafe:publicationSafePilotSummary(totals)};
  });

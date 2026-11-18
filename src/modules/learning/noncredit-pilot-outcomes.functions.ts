import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  noncreditRegistrations,noncreditTrainingVersions,learnerCourseAttempts,offeringVersions,
  learnerLessonProgress,courseLessons,assessmentAccess,
  assessmentExecutionAttempts,assessmentExecutionResults,
  assessmentFormAdministrations,noncreditCompletionDecisions,
  surveyInvitations,surveyCampaigns,surveyResponses,noncreditParticipationEvents,
  noncreditSelfEnrollmentClaims,noncreditSelfEnrollmentReleases,
} from "@/db/canonical-v301";
import {
  summarizeNoncreditPilot,publicationSafePilotSummary,attributableNoncreditFeedback,
  countDistinctNoncreditLearners,
  type PilotParticipantFact,
} from "@/domain/noncredit-pilot-outcomes";
import { requireCanonicalLabProvider } from "@/modules/operations/canonical-capability-lab-access.server";
import { currentNoncreditCompletionStates } from "@/domain/verified-completion-projection";

/**
 * Scoped operational reporting, not a public annual-report endpoint.
 * Exposes only self-registered release evidence from explicitly authorized
 * Sites. Other provider-assisted noncredit registrations need their own
 * verified Site attribution before joining this report. Participant identity
 * and raw questionnaire answers are never returned.
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
    const {organizationId,siteIds}=await requireCanonicalLabProvider("noncredit.enrollment.read");
    const to=data.to?new Date(data.to):new Date();
    const from=data.from?new Date(data.from):new Date(to.getTime()-90*86400000);
    if(!(to>from)||to.getTime()-from.getTime()>366*86400000)
      throw new Error("Pilot reporting must use a positive range of no more than 366 days");
    // The operator may deliver a Course published by a different authorized
    // provider. Scope through the operator's approved Site releases, never
    // by assuming the training publisher equals the local organization.
    const trainings=await db.selectDistinct({
      id:noncreditTrainingVersions.id,title:noncreditTrainingVersions.title,
      finalAssessmentVersionId:noncreditTrainingVersions.assessmentVersionId,
      baselineAssessmentVersionId:noncreditTrainingVersions.baselineAssessmentVersionId,
    }).from(noncreditTrainingVersions)
      .innerJoin(noncreditSelfEnrollmentReleases,eq(
        noncreditSelfEnrollmentReleases.trainingVersionId,noncreditTrainingVersions.id))
      .where(and(
        eq(noncreditSelfEnrollmentReleases.registeringOrganizationId,organizationId),
        inArray(noncreditSelfEnrollmentReleases.siteId,siteIds),
      ))
      .orderBy(asc(noncreditTrainingVersions.title)).limit(take);
    checkBound(trainings.length,"Published pilot training versions");
    if(!trainings.length)return {
      from:from.toISOString(),to:to.toISOString(),participantCount:0,distinctLearners:0,
      totals:summarizeNoncreditPilot([]),byTraining:[],
      publicationSafe:publicationSafePilotSummary(summarizeNoncreditPilot([])),
    };
    const registrations=await db.select({
      id:noncreditRegistrations.id,
      trainingVersionId:noncreditRegistrations.trainingVersionId,
      status:noncreditRegistrations.status,
      participantPersonId:noncreditRegistrations.participantPersonId,
      deploymentId:noncreditRegistrations.deploymentId,
      offeringVersionId:noncreditRegistrations.offeringVersionId,
      registeringOrganizationId:noncreditRegistrations.registeringOrganizationId,
      registeredAt:noncreditRegistrations.registeredAt,
    }).from(noncreditRegistrations)
      // A local Site operator cannot see registrations from unrelated Sites.
      // Claim + release establish the exact authorized Site for this pilot.
      .innerJoin(noncreditSelfEnrollmentClaims,and(
        eq(noncreditSelfEnrollmentClaims.registrationId,noncreditRegistrations.id),
        eq(noncreditSelfEnrollmentClaims.participantPersonId,noncreditRegistrations.participantPersonId),
      ))
      .innerJoin(noncreditSelfEnrollmentReleases,and(
        eq(noncreditSelfEnrollmentReleases.id,noncreditSelfEnrollmentClaims.releaseId),
        eq(noncreditSelfEnrollmentReleases.siteId,noncreditSelfEnrollmentClaims.siteId),
        eq(noncreditSelfEnrollmentReleases.deploymentId,noncreditRegistrations.deploymentId),
        eq(noncreditSelfEnrollmentReleases.trainingVersionId,noncreditRegistrations.trainingVersionId),
      ))
      .where(and(
        eq(noncreditSelfEnrollmentReleases.registeringOrganizationId,organizationId),
        inArray(noncreditSelfEnrollmentReleases.siteId,siteIds),
        inArray(noncreditRegistrations.trainingVersionId,trainings.map(t=>t.id)),
        gte(noncreditRegistrations.registeredAt,from),
        lt(noncreditRegistrations.registeredAt,to),
      )).limit(take);
    checkBound(registrations.length,"Noncredit registrations");
    const registrationIds=registrations.map(r=>r.id);
    if(!registrationIds.length){
      const empty=summarizeNoncreditPilot([]);
      return {from:from.toISOString(),to:to.toISOString(),participantCount:0,distinctLearners:0,
        totals:empty,byTraining:[],publicationSafe:publicationSafePilotSummary(empty)};
    }
    const attempts=await db.select({
      id:learnerCourseAttempts.id,registrationId:learnerCourseAttempts.noncreditRegistrationId,
      courseVersionId:learnerCourseAttempts.courseVersionId,
    }).from(learnerCourseAttempts)
      // Completed and withdrawn Course Attempts retain historical evidence.
      // Current writes still require active participation in the owning service.
      .where(and(inArray(learnerCourseAttempts.noncreditRegistrationId,registrationIds),
        inArray(learnerCourseAttempts.status,["active","completed","withdrawn"]))).limit(take);
    checkBound(attempts.length,"Course attempts");
    const courseIds=attempts.map(row=>row.id);
    const versions=uuidSet(attempts.map(row=>row.courseVersionId));
    const [lessons,progress,grants,decisions,participationEvents]=await Promise.all([
      versions.length?db.select({id:courseLessons.id,courseVersionId:courseLessons.courseVersionId})
        .from(courseLessons).where(inArray(courseLessons.courseVersionId,versions)):[],
      courseIds.length?db.select({
        courseAttemptId:learnerLessonProgress.courseAttemptId,
        lessonId:learnerLessonProgress.lessonId,status:learnerLessonProgress.status,
        observedAt:learnerLessonProgress.observedAt,
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
        .orderBy(desc(noncreditCompletionDecisions.decidedAt)).limit(20001),
      db.select({
        registrationId:noncreditParticipationEvents.registrationId,
        occurredAt:noncreditParticipationEvents.occurredAt,
        countedMinutes:noncreditParticipationEvents.countedMinutes,
      }).from(noncreditParticipationEvents)
        .where(inArray(noncreditParticipationEvents.registrationId,registrationIds)),
    ]);
    if(decisions.length>20000)
      throw new Error("Completion decision history exceeds the safe report limit");
    const completion=currentNoncreditCompletionStates(registrationIds,decisions);
    if(completion.invalidRegistrations.length)
      throw new Error("Noncredit completion history needs independent reconciliation");
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
    // A deployment may contain multiple independent training Offerings.
    // An identified response is attributable only when its approved campaign
    // explicitly names the same Offering as the participant's registration.
    // Deployment-wide or unrelated campaigns are not course feedback.
    const offeringVersionIds=uuidSet(registrations.map(r=>r.offeringVersionId));
    const offeringRows=offeringVersionIds.length?await db.select({
      id:offeringVersions.id,offeringId:offeringVersions.offeringId,
    }).from(offeringVersions).where(inArray(offeringVersions.id,offeringVersionIds)):[];
    const offeringByVersion=new Map(offeringRows.map(row=>[row.id,row.offeringId]));
    const offeringIds=uuidSet(offeringRows.map(row=>row.offeringId));
    const people=uuidSet(registrations.map(r=>r.participantPersonId));
    const deployments=uuidSet(registrations.map(r=>r.deploymentId));
    const surveys=people.length&&deployments.length&&offeringIds.length?await db.select({
      personId:surveyInvitations.invitedPersonId,
      deploymentId:surveyCampaigns.deploymentId,
      offeringId:surveyCampaigns.offeringId,
      operatingOrganizationId:surveyCampaigns.operatingOrganizationId,
      submittedAt:surveyResponses.submittedAt,
    }).from(surveyResponses)
      .innerJoin(surveyInvitations,and(
        eq(surveyResponses.invitationId,surveyInvitations.id),
        eq(surveyResponses.campaignId,surveyInvitations.campaignId),
      ))
      .innerJoin(surveyCampaigns,eq(surveyInvitations.campaignId,surveyCampaigns.id))
      .where(and(
        inArray(surveyInvitations.invitedPersonId,people),
        inArray(surveyCampaigns.deploymentId,deployments),
        inArray(surveyCampaigns.offeringId,offeringIds),
        eq(surveyResponses.respondentMode,"identified"),
      )).limit(take):[];
    checkBound(surveys.length,"Survey responses");
    // Only one in-window registration for a Person, Deployment and Offering
    // may claim an invited response. A retake or duplicate registration needs
    // explicit registration-to-invitation provenance rather than guesswork.
    const registrationCounts=new Map<string,number>();
    const feedbackKey=(personId:string,deploymentId:string,offeringId:string,organizationId:string)=>
      [personId,deploymentId,offeringId,organizationId].join(":");
    for(const r of registrations){
      const offeringId=offeringByVersion.get(r.offeringVersionId);
      if(!offeringId)continue;
      const key=feedbackKey(r.participantPersonId,r.deploymentId,offeringId,r.registeringOrganizationId);
      registrationCounts.set(key,(registrationCounts.get(key)??0)+1);
    }
    const surveyTimestamps=new Map<string,Date>();
    for(const s of surveys){
      if(!s.offeringId)continue;
      const key=feedbackKey(s.personId,s.deploymentId!,s.offeringId,s.operatingOrganizationId);
      const previous=surveyTimestamps.get(key);
      if(!previous||previous<s.submittedAt)surveyTimestamps.set(key,s.submittedAt);
    }
    const attemptById=new Map(attempts.map(a=>[a.id,a]));
    const grantsById=new Map(grants.map(g=>[g.id,g]));
    const adminById=new Map(administrations.map(a=>[a.id,a]));
    const supersededResults=new Set(results.flatMap(r=>r.supersedesId?[r.supersedesId]:[]));
    const latestResults=results.filter(r=>!supersededResults.has(r.id)&&r.status==="finalized");
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
      const startedBeforeInstruction=!!firstBaseline&&
        !progress.some(p=>ownAttemptIds.has(p.courseAttemptId)&&p.status==="completed"&&
          p.observedAt<checkById.get(firstBaseline.attemptId)!.submittedAt!)&&
        !participationEvents.some(p=>p.registrationId===reg.id&&p.countedMinutes>0&&
          p.occurredAt<checkById.get(firstBaseline.attemptId)!.submittedAt!);
      const paired=!!firstBaseline&&!!firstFinal&&startedBeforeInstruction&&
        checkById.get(firstBaseline.attemptId)!.submittedAt!<
        checkById.get(firstFinal.attemptId)!.submittedAt!;
      const passed=finalResults.find(r=>r.outcome==="pass");
      const offeringId=offeringByVersion.get(reg.offeringVersionId);
      const surveyKey=offeringId?feedbackKey(reg.participantPersonId,reg.deploymentId,offeringId,reg.registeringOrganizationId):null;
      const feedbackSubmittedAt=surveyKey?surveyTimestamps.get(surveyKey):undefined;
      const hasSubmitted=finalCheck.some(c=>c.submittedAt!==null);
      return {
        registrationId:reg.id,trainingVersionId:reg.trainingVersionId,registered:true,
        engaged:doneLessons.size>0||hasSubmitted||
          participationEvents.some(e=>e.registrationId===reg.id),
        completedLessonCount:doneLessons.size,totalLessonCount:relevantLessons.size,
        knowledgeSubmitted:hasSubmitted,
        knowledgeResult:passed?"pass":finalResults[0]?.outcome??null,
        surveySubmitted:attributableNoncreditFeedback({
          offeringId:offeringId??null,
          registrationsForPersonOffering:surveyKey?registrationCounts.get(surveyKey)??0:0,
          registeredAt:reg.registeredAt,
          latestSubmittedAt:feedbackSubmittedAt??null,
        }),
        completionRecorded:completion.states.get(reg.id)==="completed",
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
      participantCount:registrations.length,
      distinctLearners:countDistinctNoncreditLearners(registrations.map(r=>r.participantPersonId)),
      totals,byTraining,
      publicationSafe:publicationSafePilotSummary(totals)};
  });

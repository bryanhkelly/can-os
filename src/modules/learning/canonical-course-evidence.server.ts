import { requireCanonicalLearningActivityEnabled } from "@/modules/learning/canonical-learning-release.server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {parseCommandInput} from "@/domain/command-input";
import {latestCanonicalAssessmentRevisions} from "@/domain/canonical-assessment-revisions";
import {projectCurrentNoncreditCompletion} from "@/domain/verified-completion-projection";
import {input} from "./canonical-course-evidence.inputs";
import { db } from "@/db/client";
import {
  assessmentAccess, assessmentExecutionAttempts, assessmentExecutionResults,
  canonicalLearningEvents, domainEvents, noncreditCompletionDecisions,
  surveyInvitations, surveyResponses,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "./canonical-course-participation.server";


/**
 * A learner-owned evidence read model. Clinical/safeguarding data and survey
 * answers are deliberately excluded. Definitive outcomes are queried from
 * canonical records, never inferred from client telemetry.
 */
export async function getCanonicalCourseEvidenceService(request:Request,raw:unknown){
    const data=parseCommandInput(input,raw);
    requireCanonicalLearningActivityEnabled();
    const actor = await getInstructionalLearnerContext(request);
    const personId = actor.actorPersonId;
    if (!personId || !["student","learner"].includes(actor.role ?? ""))
      throw new AuthorizationError("authenticated learner");
    return db.transaction(async tx => {
      const participation = await authorizeCanonicalCourseAttempt(
        tx, actor, data.courseAttemptId, true,
      );
      const observations = await tx.select({
        id:canonicalLearningEvents.id,
        kind:canonicalLearningEvents.kind,
        lessonId:canonicalLearningEvents.lessonId,
        resourceId:canonicalLearningEvents.resourceId,
        receivedAt:canonicalLearningEvents.receivedAt,
        estimatedActiveMs:canonicalLearningEvents.estimatedActiveMs,
      }).from(canonicalLearningEvents)
        .where(eq(canonicalLearningEvents.courseAttemptId,data.courseAttemptId))
        .orderBy(desc(canonicalLearningEvents.receivedAt)).limit(100);

      const attempts = await tx.select({
        id:assessmentExecutionAttempts.id,
        state:assessmentExecutionAttempts.state,
        startedAt:assessmentExecutionAttempts.startedAt,
        createdAt:assessmentExecutionAttempts.createdAt,
        submittedAt:assessmentExecutionAttempts.submittedAt,
        attemptNo:assessmentExecutionAttempts.attemptNo,
      }).from(assessmentExecutionAttempts)
        .innerJoin(assessmentAccess,eq(
          assessmentAccess.id,assessmentExecutionAttempts.accessGrantId,
        ))
        .where(eq(assessmentAccess.courseAttemptId,data.courseAttemptId))
        .orderBy(desc(assessmentExecutionAttempts.createdAt)).limit(40);
      const results = attempts.length
        ? await tx.select({
          id:assessmentExecutionResults.id,
          attemptId:assessmentExecutionResults.attemptId,
          resultRevision:assessmentExecutionResults.resultRevision,
          supersedesId:assessmentExecutionResults.supersedesId,
          resultStatus:assessmentExecutionResults.resultStatus,
          outcome:assessmentExecutionResults.outcome,
        }).from(assessmentExecutionResults).where(
          inArray(assessmentExecutionResults.attemptId,attempts.map(a=>a.id)),
        ).orderBy(desc(assessmentExecutionResults.resultRevision)).limit(1001)
        : [];
      if(results.length>1000)throw new AuthorizationError("Assessment revision history requires pagination");
      const projected=latestCanonicalAssessmentRevisions(results);
      if(projected.ambiguousAttemptIds.length)throw new AuthorizationError("Ambiguous assessment revision history");
      const latestResults=new Map(projected.current.map(result=>[result.attemptId,result]));

      // Survey submission links are taken from the durable event written
      // in the *same transaction* as the identified survey response.
      // Do not generalize this path to anonymous/confidential surveys.
      const surveys=await tx.select({
        responseId:surveyResponses.id,submittedAt:surveyResponses.submittedAt,
        campaignId:surveyResponses.campaignId,
      }).from(domainEvents)
        .innerJoin(surveyResponses,eq(surveyResponses.id,domainEvents.aggregateId))
        .innerJoin(surveyInvitations,and(
          eq(surveyInvitations.id,surveyResponses.invitationId),
          eq(surveyInvitations.campaignId,surveyResponses.campaignId),
          eq(surveyInvitations.invitedPersonId,personId),
        ))
        .where(and(
          eq(domainEvents.eventType,"LearningSurveySubmitted"),
          eq(domainEvents.aggregateType,"survey_response"),
          eq(domainEvents.actorPersonId,personId),
          eq(surveyResponses.respondentMode,"identified"),
          sql`${domainEvents.payload}->>'courseAttemptId' = ${data.courseAttemptId}`,
        )).orderBy(desc(surveyResponses.submittedAt)).limit(40);

      const decisions=participation.noncreditRegistrationId
        ? await tx.select({
          id:noncreditCompletionDecisions.id,
          registrationId:noncreditCompletionDecisions.registrationId,
          outcome:noncreditCompletionDecisions.outcome,
          decidedAt:noncreditCompletionDecisions.decidedAt,
          supersedesId:noncreditCompletionDecisions.supersedesId,
        }).from(noncreditCompletionDecisions).where(eq(
          noncreditCompletionDecisions.registrationId,
          participation.noncreditRegistrationId,
        )).orderBy(desc(noncreditCompletionDecisions.decidedAt)).limit(501)
        : [];
      if(decisions.length>500)throw new AuthorizationError("Completion history requires pagination");
      const current=participation.noncreditRegistrationId?projectCurrentNoncreditCompletion(participation.noncreditRegistrationId,decisions):null;
      if(current?.state==="unavailable")throw new AuthorizationError("Ambiguous completion decision history");
      const currentDecision=current?.decisionId?decisions.find(d=>d.id===current.decisionId):undefined;
      return {
        courseAttemptId:data.courseAttemptId,
        observations:observations.map(o=>({
          ...o,receivedAt:o.receivedAt.toISOString(),
        })),
        assessments:attempts.map(a=>{
          const r=latestResults.get(a.id);
          return {
            id:a.id,attemptNo:a.attemptNo,state:a.state,
            startedAt:(a.startedAt??a.createdAt).toISOString(),
            submittedAt:a.submittedAt?.toISOString()??null,
            resultStatus:r?.resultStatus??null,
            // Only finalized, current results may be labeled as such.
            finalizedOutcome:a.state==="finalized"&&r?.resultStatus==="finalized"?r.outcome:null,
          };
        }),
        surveys:surveys.map(s=>({...s,submittedAt:s.submittedAt.toISOString()})),
        completion:currentDecision?{
          id:currentDecision.id,outcome:currentDecision.outcome,
          decidedAt:currentDecision.decidedAt.toISOString(),
        }:null,
        caution:"Interaction time is estimated, not official attendance, instruction minutes, assessment performance or credit.",
      };
    });
}

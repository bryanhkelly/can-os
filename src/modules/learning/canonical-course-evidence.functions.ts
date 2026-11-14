import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  assessmentAccess, assessmentExecutionAttempts, assessmentExecutionResults,
  canonicalLearningEvents, domainEvents, noncreditCompletionDecisions,
  surveyInvitations, surveyResponses,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "./canonical-course-participation.server";

const input = z.object({ courseAttemptId: z.string().uuid() }).strict();

/**
 * A learner-owned evidence read model. Clinical/safeguarding data and survey
 * answers are deliberately excluded. Definitive outcomes are queried from
 * canonical records, never inferred from client telemetry.
 */
export const getCanonicalCourseEvidence = createServerFn({ method: "GET" })
  .validator((value: unknown) => input.parse(value))
  .handler(async ({data}) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getInstructionalLearnerContext(getRequest());
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
          resultStatus:assessmentExecutionResults.resultStatus,
          outcome:assessmentExecutionResults.outcome,
        }).from(assessmentExecutionResults).where(
          inArray(assessmentExecutionResults.attemptId,attempts.map(a=>a.id)),
        ).orderBy(desc(assessmentExecutionResults.resultRevision))
        : [];
      const latestResults=new Map<string,typeof results[number]>();
      for(const result of results) if(!latestResults.has(result.attemptId))
        latestResults.set(result.attemptId,result);

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
          outcome:noncreditCompletionDecisions.outcome,
          decidedAt:noncreditCompletionDecisions.decidedAt,
          supersedesId:noncreditCompletionDecisions.supersedesId,
        }).from(noncreditCompletionDecisions).where(eq(
          noncreditCompletionDecisions.registrationId,
          participation.noncreditRegistrationId,
        )).orderBy(desc(noncreditCompletionDecisions.decidedAt)).limit(10)
        : [];
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
            finalizedOutcome:r?.resultStatus==="finalized"?r.outcome:null,
          };
        }),
        surveys:surveys.map(s=>({...s,submittedAt:s.submittedAt.toISOString()})),
        completion:decisions[0]?{
          id:decisions[0].id,outcome:decisions[0].outcome,
          decidedAt:decisions[0].decidedAt.toISOString(),
        }:null,
        caution:"Interaction time is estimated, not official attendance, instruction minutes, assessment performance or credit.",
      };
    });
  });

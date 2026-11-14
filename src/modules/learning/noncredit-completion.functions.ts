import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  assessmentAccessGrants, assessmentAdministrations, assessmentAttemptResults,
  assessmentAttempts, evidenceDocumentVersions, noncreditCompletionDecisions,
  noncreditCompletionPolicies, noncreditParticipationEvents,
  noncreditRegistrations, noncreditTrainingVersions,
  learnerLessonProgress, courseLessons,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { evaluateNoncreditCompletion } from "@/domain/noncredit-completion";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "./canonical-course-participation.server";

const input=z.object({courseAttemptId:z.string().uuid()}).strict();

/**
 * Canonical, read-only completion readiness. Self-reported lesson completion,
 * opened media and elapsed browser time DO NOT create participation minutes.
 * The existing canonical DB trigger controls any later formal decision.
 */
export const getNoncreditCompletionReadiness=createServerFn({method:"GET"})
  .validator((v:unknown)=>input.parse(v))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const context=await getInstructionalLearnerContext(getRequest());
    if(context.role!=="learner"||!context.actorPersonId)throw new AuthorizationError("canonical learner");
    assertCapability(context,"learning.participate");
    return db.transaction(async tx=>{
      const authorized=await authorizeCanonicalCourseAttempt(tx,context,data.courseAttemptId,true);
      if(authorized.source!=="noncredit"||!authorized.noncreditRegistrationId)
        throw new AuthorizationError("noncredit course attempt");
      const [registration]=await tx.select().from(noncreditRegistrations)
        .where(eq(noncreditRegistrations.id,authorized.noncreditRegistrationId)).limit(1);
      if(!registration||registration.participantPersonId!==context.actorPersonId)
        throw new AuthorizationError("personal noncredit registration");
      const [training]=await tx.select().from(noncreditTrainingVersions)
        .where(eq(noncreditTrainingVersions.id,registration.trainingVersionId)).limit(1);
      if(!training)throw new AuthorizationError("published noncredit training");
      const now=new Date();
      const [policy]=await tx.select().from(noncreditCompletionPolicies)
        .where(and(eq(noncreditCompletionPolicies.trainingVersionId,registration.trainingVersionId),
          lte(noncreditCompletionPolicies.effectiveAt,now)))
        .orderBy(desc(noncreditCompletionPolicies.policyVersion)).limit(1);
      const [lessons,progress]=await Promise.all([
        tx.select({id:courseLessons.id}).from(courseLessons)
          .where(eq(courseLessons.courseVersionId,authorized.courseVersionId)),
        tx.select({lessonId:learnerLessonProgress.lessonId})
          .from(learnerLessonProgress)
          .where(and(
            eq(learnerLessonProgress.courseAttemptId,authorized.courseAttemptId),
            eq(learnerLessonProgress.status,"completed"),
          )),
      ]);
      const lessonIds=new Set(lessons.map(lesson=>lesson.id));
      const completedLessonCount=new Set(progress.map(row=>row.lessonId)
        .filter(id=>lessonIds.has(id))).size;
      const events=await tx.select().from(noncreditParticipationEvents)
        .where(eq(noncreditParticipationEvents.registrationId,registration.id));
      const evidenceIds=[...new Set(events.flatMap(e=>e.evidenceVersionId?[e.evidenceVersionId]:[]))];
      const evidence=evidenceIds.length?await tx.select().from(evidenceDocumentVersions)
        .where(inArray(evidenceDocumentVersions.id,evidenceIds)):[];
      const today=now.toISOString().slice(0,10);
      const validEvidence=new Set(evidence.filter(e=>
        e.verifiedAt!==null&&e.verifiedAt<=now&&e.verifiedByPersonId!==null &&
        (e.validFrom===null||e.validFrom<=today)&&
        (e.validThrough===null||e.validThrough>=today)
      ).map(e=>e.id));
      const participation=events.map(e=>({
        id:e.id,supersedesId:e.supersedesId,eventKind:e.eventKind,
        countedMinutes:e.countedMinutes,occurredAt:e.occurredAt,
        evidenceVersionId:e.evidenceVersionId&&validEvidence.has(e.evidenceVersionId)?e.evidenceVersionId:null,
      }));
      let assessment:null | {learnerId:string|null;assessmentVersionId:string;
        resultStatus:"provisional"|"reviewed"|"finalized"|"voided";
        pointsEarned:number;pointsPossible:number}=null;
      if(training.assessmentVersionId&&registration.learnerId){
        const results=await tx.select({
          id:assessmentAttemptResults.id,
          attemptId:assessmentAttemptResults.attemptId,
          resultStatus:assessmentAttemptResults.resultStatus,
          learnerId:assessmentAttempts.learnerId,
          assessmentVersionId:assessmentAdministrations.assessmentVersionId,
          pointsEarned:assessmentAttemptResults.pointsEarned,
          pointsPossible:assessmentAttemptResults.pointsPossible,
          resultRevision:assessmentAttemptResults.resultRevision,
          supersedesId:assessmentAttemptResults.supersedesId,
        }).from(assessmentAttemptResults)
          .innerJoin(assessmentAttempts,eq(assessmentAttempts.id,assessmentAttemptResults.attemptId))
          .innerJoin(assessmentAccessGrants,and(
            eq(assessmentAccessGrants.id,assessmentAttempts.accessGrantId),
            eq(assessmentAccessGrants.courseAttemptId,authorized.courseAttemptId),
            eq(assessmentAccessGrants.accessStatus,"approved")))
          .innerJoin(assessmentAdministrations,eq(
            assessmentAdministrations.id,assessmentAttempts.administrationId))
          .where(and(eq(assessmentAttempts.learnerId,registration.learnerId),
            eq(assessmentAdministrations.assessmentVersionId,training.assessmentVersionId)))
          .orderBy(desc(assessmentAttemptResults.resultRevision));
        const superseded=new Set(results.flatMap(r=>r.supersedesId?[r.supersedesId]:[]));
        const current=results.filter(r=>!superseded.has(r.id)&&r.resultStatus==="finalized")
          .sort((a,b)=>Number(b.pointsEarned)/Number(b.pointsPossible)-
                        Number(a.pointsEarned)/Number(a.pointsPossible))[0];
        if(current)assessment={
          learnerId:current.learnerId,assessmentVersionId:current.assessmentVersionId,
          resultStatus:current.resultStatus,pointsEarned:Number(current.pointsEarned),
          pointsPossible:Number(current.pointsPossible),
        };
      }
      const result=evaluateNoncreditCompletion({
        registrationStatus:registration.status,trainingVersionId:training.id,
        trainingState:training.state,learnerId:registration.learnerId,
        assessmentVersionId:training.assessmentVersionId,
        policy:policy?{
          trainingVersionId:policy.trainingVersionId,
          effectiveAt:policy.effectiveAt,
          minParticipationMinutes:policy.minParticipationMinutes,
          requireAllLessons:policy.requireAllLessons,
          skillsAssessmentRequired:policy.skillsAssessmentRequired,
          minimumAssessmentFraction:policy.minimumAssessmentFraction===null
            ?null:Number(policy.minimumAssessmentFraction),
        }:null,
        participation,completedLessonCount,totalLessonCount:lessonIds.size,assessment,now,
      });
      const [latestDecision]=await tx.select({
        id:noncreditCompletionDecisions.id,
        outcome:noncreditCompletionDecisions.outcome,
      }).from(noncreditCompletionDecisions)
        .where(eq(noncreditCompletionDecisions.registrationId,registration.id))
        .orderBy(desc(noncreditCompletionDecisions.decidedAt)).limit(1);
      return {
        courseAttemptId:authorized.courseAttemptId,trainingVersionId:training.id,
        policyVersion:policy?.policyVersion??null,
        ...result,recordedCompletion:latestDecision?.outcome==="completed",
      };
    });
  });

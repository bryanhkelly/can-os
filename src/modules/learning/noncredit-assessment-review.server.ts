import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  assessmentAccess, assessmentAutoScores, assessmentDefinitions, assessmentExecutionAttempts,
  assessmentExecutionItems, assessmentExecutionResults, assessmentFormAdministrations,
  assessmentVersions, auditEvents, domainEvents, learnerCourseAttempts,
  noncreditRegistrations, noncreditTrainingVersions,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability, type CommandContext } from "@/domain/command-context";
import { evaluateKnowledgeCheckResult } from "@/domain/noncredit-knowledge-check";
import { assessmentFormVersions } from "@/db/canonical-v301";

/**
 * A provider-authorized human confirms the automatically scored knowledge
 * check. This is NOT school grading. SQL requires an accountable reviewer and
 * reconciles all item scores before allowing a finalized result.
 */
export async function finalizeNoncreditKnowledgeCheck(context:CommandContext,input:{
  courseAttemptId:string;assessmentAttemptId:string;
}) {
  if(!context.actorPersonId||!["site_admin","registrar"].includes(context.role??""))
    throw new AuthorizationError("authorized noncredit assessment reviewer");
  assertCapability(context,"noncredit.assessment.finalize");
  return db.transaction(async tx=>{
    const [attempt]=await tx.select().from(assessmentExecutionAttempts)
      .where(eq(assessmentExecutionAttempts.id,input.assessmentAttemptId))
      .for("update").limit(1);
    if(!attempt)throw new AuthorizationError("existing submitted knowledge check");
    const [grant]=await tx.select().from(assessmentAccess)
      .where(and(eq(assessmentAccess.id,attempt.accessGrantId),
        eq(assessmentAccess.courseAttemptId,input.courseAttemptId))).limit(1);
    if(!grant||grant.learnerId!==attempt.learnerId)
      throw new AuthorizationError("matching course assessment grant");
    const [courseAttempt]=await tx.select().from(learnerCourseAttempts)
      .where(eq(learnerCourseAttempts.id,input.courseAttemptId)).limit(1);
    if(!courseAttempt||courseAttempt.enrollmentId||courseAttempt.sectionId||
      !courseAttempt.noncreditRegistrationId||courseAttempt.status!=="active")
      throw new AuthorizationError("noncredit course attempt");
    const [registration]=await tx.select().from(noncreditRegistrations)
      .where(and(eq(noncreditRegistrations.id,courseAttempt.noncreditRegistrationId),
        eq(noncreditRegistrations.deploymentId,courseAttempt.deploymentId))).limit(1);
    if(!registration||registration.learnerId!==attempt.learnerId||
      !["registered","active"].includes(registration.status))
      throw new AuthorizationError("current noncredit registration");
    if(registration.participantPersonId===context.actorPersonId)
      throw new AuthorizationError("independent provider assessment review");
    const [training]=await tx.select().from(noncreditTrainingVersions)
      .where(eq(noncreditTrainingVersions.id,registration.trainingVersionId)).limit(1);
    if(!training||training.state!=="published"||
      !context.scope.organizationIds?.includes(training.providerOrganizationId))
      throw new AuthorizationError("provider-owned training");
    const [administration]=await tx.select().from(assessmentFormAdministrations)
      .where(eq(assessmentFormAdministrations.id,attempt.administrationId)).limit(1);
    const baseline=administration?.assessmentVersionId===training.baselineAssessmentVersionId;
    const isFinalAssessment=administration?.assessmentVersionId===training.assessmentVersionId;
    if(!administration||(!baseline&&!isFinalAssessment)||
      administration.deploymentId!==courseAttempt.deploymentId||
      administration.courseVersionId!==courseAttempt.courseVersionId||
      administration.administeringOrganizationId!==training.providerOrganizationId)
      throw new AuthorizationError("assessment belongs to training deployment");
    const [version]=await tx.select().from(assessmentVersions)
      .where(eq(assessmentVersions.id,administration.assessmentVersionId)).limit(1);
    const [definition]=version?await tx.select().from(assessmentDefinitions)
      .where(eq(assessmentDefinitions.id,version.assessmentId)).limit(1):[];
    if(!version||version.lifecycle!=="published"||!definition||
       (baseline?definition.purpose!=="diagnostic":
        !["formative","practice","readiness","mastery"].includes(definition.purpose)))
      throw new AuthorizationError("noncredit knowledge check");
    const [form]=await tx.select().from(assessmentFormVersions)
      .where(eq(assessmentFormVersions.id,attempt.formVersionId)).limit(1);
    if(!form||form.assessmentVersionId!==version.id)
      throw new AuthorizationError("matching assessment form version");
    const [prior]=await tx.select().from(assessmentExecutionResults)
      .where(eq(assessmentExecutionResults.attemptId,attempt.id))
      .orderBy(desc(assessmentExecutionResults.resultRevision)).limit(1);
    if(attempt.state==="finalized"&&prior?.resultStatus==="finalized")
      return {resultId:prior.id,alreadyFinalized:true};
    if(attempt.state!=="scored"||!prior||prior.resultStatus!=="provisional"||
      prior.resultRevision!==1)throw new AuthorizationError("provisionally scored assessment");
    const items=await tx.select().from(assessmentExecutionItems)
      .where(eq(assessmentExecutionItems.attemptId,attempt.id));
    const scores=await tx.select().from(assessmentAutoScores)
      .where(inArray(assessmentAutoScores.attemptItemId,items.map(item=>item.id)));
    if(!items.length||scores.length!==items.length||
      new Set(scores.map(s=>s.attemptItemId)).size!==items.length||
      scores.some(s=>s.scoringKind!=="automated"))
      throw new Error("Item-level scoring must be complete and unambiguous");
    const total=items.reduce((n,item)=>n+Number(item.pointsAvailable),0);
    const earned=scores.reduce((n,score)=>n+Number(score.score),0);
    const evaluated=evaluateKnowledgeCheckResult(earned,total,
      form.passingFraction===null?null:Number(form.passingFraction));
    if(Number(prior.pointsEarned)!==earned||Number(prior.pointsPossible)!==total||
      prior.outcome!==evaluated.outcome)
      throw new Error("Provisional knowledge result disagrees with item scores");
    // This insert is independently validated by validate_assessment_result:
    // it requires the accountable reviewer and exact item-scoring totals.
    const [final]=await tx.insert(assessmentExecutionResults).values({
      attemptId:attempt.id,resultRevision:2,resultStatus:"finalized",
      pointsEarned:earned.toFixed(4),pointsPossible:total.toFixed(4),
      outcome:evaluated.outcome,reviewedByPersonId:context.actorPersonId,
      supersedesId:prior.id,
      resultEvidence:{noncredit:true,reviewKind:"provider_confirmation"},
    }).returning({id:assessmentExecutionResults.id});
    if(!final)throw new Error("Final assessment result was not saved");
    await tx.update(assessmentExecutionAttempts).set({state:"finalized"})
      .where(eq(assessmentExecutionAttempts.id,attempt.id));
    const payload={courseAttemptId:courseAttempt.id,
      assessmentAttemptId:attempt.id,resultId:final.id,
      outcome:evaluated.outcome,noncredit:true};
    await tx.insert(auditEvents).values({
      actorPersonId:context.actorPersonId,
      owningOrganizationId:training.providerOrganizationId,
      eventCode:"noncredit.assessment.finalized",
      entityKind:"assessment_attempt_result",entityId:final.id,payload,
    });
    await tx.insert(domainEvents).values({
      eventType:"NoncreditKnowledgeCheckFinalized",
      aggregateType:"assessment_attempt_result",aggregateId:final.id,
      actorPersonId:context.actorPersonId,payload,
    });
    return {resultId:final.id,alreadyFinalized:false,
      outcome:evaluated.outcome,pointsEarned:earned,pointsPossible:total};
  });
}

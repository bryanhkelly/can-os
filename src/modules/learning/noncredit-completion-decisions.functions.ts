import { and, desc, eq, lte } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import { auditEvents, domainEvents, learnerCourseAttempts, noncreditRegistrations,
  noncreditTrainingVersions, noncreditCompletionPolicies,
  noncreditCompletionDecisions } from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";

const schema=z.object({
  courseAttemptId:z.string().uuid(),
  expectedPolicyId:z.string().uuid(),
  assessmentResultId:z.string().uuid().nullable(),
}).strict();

/**
 * An authorized noncredit provider, never a learner, records completion.
 * Canonical v28_validate_completion SQL rechecks documented participation,
 * policy validity, and finalized participant assessment in the transaction.
 * This is noncredit and never creates a school grade or transcript.
 */
export const decideNoncreditCompletion=createServerFn({method:"POST"})
  .validator((value:unknown)=>schema.parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCanonicalCommandContext(getRequest());
    if(!actor.actorPersonId||!["registrar","site_admin"].includes(actor.role??""))
      throw new AuthorizationError("authorized noncredit provider");
    assertCapability(actor,"noncredit.completion.decide");
    return db.transaction(async tx=>{
      const [attempt]=await tx.select().from(learnerCourseAttempts)
        .where(eq(learnerCourseAttempts.id,data.courseAttemptId)).limit(1);
      if(!attempt||!attempt.noncreditRegistrationId||attempt.enrollmentId||
         attempt.sectionId||attempt.status!=="active")
        throw new AuthorizationError("active noncredit course attempt");
      // Lock the registration to serialize concurrent decisions and retries.
      const [registration]=await tx.select().from(noncreditRegistrations)
        .where(and(eq(noncreditRegistrations.id,attempt.noncreditRegistrationId),
          eq(noncreditRegistrations.deploymentId,attempt.deploymentId)))
        .for("update").limit(1);
      if(!registration||!["registered","active"].includes(registration.status)||
         registration.adoptionId!==attempt.adoptionId||
         registration.offeringVersionId!==attempt.offeringVersionId)
        throw new AuthorizationError("current noncredit registration");
      const [training]=await tx.select().from(noncreditTrainingVersions)
        .where(and(eq(noncreditTrainingVersions.id,registration.trainingVersionId),
          eq(noncreditTrainingVersions.offeringVersionId,attempt.offeringVersionId))).limit(1);
      if(!training||training.state!=="published"||
         !actor.scope.organizationIds?.includes(training.providerOrganizationId))
        throw new AuthorizationError("provider-owned noncredit training");
      const [policy]=await tx.select().from(noncreditCompletionPolicies)
        .where(and(eq(noncreditCompletionPolicies.trainingVersionId,training.id),
          lte(noncreditCompletionPolicies.effectiveAt,new Date())))
        .orderBy(desc(noncreditCompletionPolicies.policyVersion)).limit(1);
      if(!policy||policy.id!==data.expectedPolicyId)
        throw new AuthorizationError("current noncredit completion policy");
      if(policy.skillsAssessmentRequired&&!data.assessmentResultId)
        throw new AuthorizationError("finalized assessment result");
      const decisions=await tx.select().from(noncreditCompletionDecisions)
        .where(eq(noncreditCompletionDecisions.registrationId,registration.id))
        .orderBy(desc(noncreditCompletionDecisions.decidedAt));
      const superseded=new Set(decisions.flatMap(row=>row.supersedesId?[row.supersedesId]:[]));
      const latest=decisions.find(row=>!superseded.has(row.id));
      if(latest?.outcome==="completed")return {decisionId:latest.id,alreadyCompleted:true};
      const [created]=await tx.insert(noncreditCompletionDecisions).values({
        registrationId:registration.id,policyId:policy.id,
        assessmentResultId:data.assessmentResultId,outcome:"completed",
        decidedByPersonId:actor.actorPersonId,supersedesId:latest?.id??null,
      }).returning({id:noncreditCompletionDecisions.id});
      if(!created)throw new Error("Unable to save the noncredit completion decision");
      const payload={courseAttemptId:attempt.id,registrationId:registration.id,
        policyId:policy.id,assessmentResultId:data.assessmentResultId};
      await tx.insert(auditEvents).values({actorPersonId:actor.actorPersonId,
        owningOrganizationId:training.providerOrganizationId,
        eventCode:"learning.noncredit.completed",entityKind:"noncredit_completion_decision",
        entityId:created.id,payload});
      await tx.insert(domainEvents).values({eventType:"NoncreditTrainingCompleted",
        aggregateType:"noncredit_completion_decision",aggregateId:created.id,
        actorPersonId:actor.actorPersonId,payload});
      return {decisionId:created.id,alreadyCompleted:false};
    });
  });

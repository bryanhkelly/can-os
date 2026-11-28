import {projectCurrentNoncreditCompletion} from "@/domain/verified-completion-projection";
import {DomainError} from "@/domain/errors";
import {parseCommandInput} from "@/domain/command-input";
import {schema} from "./noncredit-completion-decisions.inputs";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { EventTypes } from "@/domain/event-types";
import { domainEvents as canNotificationEvents } from "@/db/schema";
import { auditEvents, domainEvents, learnerCourseAttempts, noncreditRegistrations,
  noncreditTrainingVersions, noncreditCompletionPolicies,
  noncreditCompletionDecisions } from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { assertCurrentCanonicalStaffForMutation } from "@/modules/identity/canonical-transaction-authorization.server";
import { assertNoncreditCompletionSiteScope } from "@/modules/learning/verified-completion-site.server";



/**
 * An authorized noncredit provider, never a learner, records completion.
 * Canonical v28_validate_completion SQL rechecks documented participation,
 * policy validity, and finalized participant assessment in the transaction.
 * This is noncredit and never creates a school grade or transcript.
 */
export async function decideNoncreditCompletionService(request:Request,raw:unknown){const data=parseCommandInput(schema,raw);
    const actor=await getCanonicalCommandContext(request);
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
         registration.offeringVersionId!==attempt.offeringVersionId||
         registration.participantPersonId===actor.actorPersonId)
        throw new AuthorizationError("current independent noncredit registration");
      await assertNoncreditCompletionSiteScope(tx,actor,registration);
      const [training]=await tx.select().from(noncreditTrainingVersions)
        .where(and(eq(noncreditTrainingVersions.id,registration.trainingVersionId),
          eq(noncreditTrainingVersions.offeringVersionId,attempt.offeringVersionId))).limit(1);
      if(!training||training.state!=="published"||
         !actor.scope.organizationIds?.includes(training.providerOrganizationId))
        throw new AuthorizationError("provider-owned noncredit training");
      const [policy]=registration.completionPolicyId
        ?await tx.select().from(noncreditCompletionPolicies)
          .where(and(
            eq(noncreditCompletionPolicies.id,registration.completionPolicyId),
            eq(noncreditCompletionPolicies.trainingVersionId,training.id),
          )).limit(1):[];
      if(!policy||policy.id!==data.expectedPolicyId||
         registration.completionPolicyId!==policy.id||
         policy.effectiveAt>new Date())
        throw new AuthorizationError("participant-pinned noncredit completion policy");
      if(policy.skillsAssessmentRequired&&!data.assessmentResultId)
        throw new AuthorizationError("finalized assessment result");
      const decisions=await tx.select().from(noncreditCompletionDecisions)
        .where(eq(noncreditCompletionDecisions.registrationId,registration.id))
        .orderBy(desc(noncreditCompletionDecisions.decidedAt));
      const projected=projectCurrentNoncreditCompletion(registration.id,decisions);
      if(projected.state==="unavailable")throw new DomainError("UNAVAILABLE","Completion history requires reconciliation");
      const latest=projected.state==="not_decided"?undefined:decisions.find(row=>row.id===projected.decisionId);
      await assertCurrentCanonicalStaffForMutation(tx,request,actor);
      if(latest?.outcome==="completed")return {decisionId:latest.id,alreadyCompleted:true};
      const [created]=await tx.insert(noncreditCompletionDecisions).values({
        registrationId:registration.id,policyId:policy.id,
        assessmentResultId:data.assessmentResultId,outcome:"completed",
        decisionSource:"provider",decidedByPersonId:actor.actorPersonId!,supersedesId:latest?.id??null,
      }).returning({id:noncreditCompletionDecisions.id});
      if(!created)throw new Error("Unable to save the noncredit completion decision");
      const payload={courseAttemptId:attempt.id,registrationId:registration.id,
        policyId:policy.id,assessmentResultId:data.assessmentResultId};
      await tx.insert(auditEvents).values({actorPersonId:actor.actorPersonId!,
        owningOrganizationId:training.providerOrganizationId,
        eventCode:"learning.noncredit.completed",entityKind:"noncredit_completion_decision",
        entityId:created.id,payload});
      await tx.insert(domainEvents).values({eventType:EventTypes.NoncreditTrainingCompleted,
        aggregateType:"noncredit_completion_decision",aggregateId:created.id,
        actorPersonId:actor.actorPersonId!,payload});
      // The native source journal lives in education_v30. CAN's notification
      // worker consumes public.domain_events instead. Publish an explicit
      // cross-schema projection in the SAME transaction so rollback cannot
      // leave a completion notice without an authoritative decision.
      // Never write a native Person UUID into the public actor FK.
      await tx.insert(canNotificationEvents).values({
        eventType:EventTypes.NoncreditTrainingCompleted,
        aggregateType:"noncredit_completion_decision",aggregateId:created.id,
        actorPersonId:null,
        payload:{canonicalDecisionId:created.id},
      });
      return {decisionId:created.id,alreadyCompleted:false};
    });
}

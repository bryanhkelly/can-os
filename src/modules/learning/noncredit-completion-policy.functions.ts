import { desc, eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest,setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  noncreditTrainingVersions,noncreditCompletionPolicies,auditEvents,domainEvents,
} from "@/db/canonical-v301";
import { AuthorizationError,assertCapability } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";

const input=z.object({
  trainingVersionId:z.string().uuid(),
  expectedLatestPolicyVersion:z.number().int().min(1).nullable(),
  minParticipationMinutes:z.number().int().min(0).max(100000),
  requireAllLessons:z.boolean(),
  skillsAssessmentRequired:z.boolean(),
  minimumAssessmentFraction:z.number().min(0).max(1).nullable(),
  completionMode:z.enum(["provider_review","automatic"]),
}).strict().refine(data=>
  !data.skillsAssessmentRequired||data.minimumAssessmentFraction!==null,
  "A required knowledge check must have a published passing threshold",
).refine(data=>data.skillsAssessmentRequired||
  data.minimumAssessmentFraction===null,
  "An optional knowledge check cannot define a required passing threshold",
);

/**
 * An authorized, independent provider reviewer publishes an APPEND-ONLY
 * completion policy. New participants receive the new version; existing
 * participants stay on their already pinned version. No background job
 * can silently opt a program into automatic completion.
 */
export const publishNoncreditCompletionPolicy=createServerFn({method:"POST"})
  .validator((data:unknown)=>input.parse(data))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCanonicalCommandContext(getRequest());
    if(!actor.actorPersonId||!["registrar","site_admin"].includes(actor.role??""))
      throw new AuthorizationError("authorized provider completion-policy approver");
    assertCapability(actor,"noncredit.completion.decide");
    return db.transaction(async tx=>{
      const [training]=await tx.select().from(noncreditTrainingVersions)
        .where(eq(noncreditTrainingVersions.id,data.trainingVersionId))
        .for("update").limit(1);
      if(!training||training.state!=="published"||
        !actor.scope.organizationIds?.includes(training.providerOrganizationId))
        throw new AuthorizationError("published provider-owned noncredit training");
      if(training.authorPersonId===actor.actorPersonId)
        throw new AuthorizationError("independent approval of completion requirements");
      if(data.skillsAssessmentRequired&&!training.assessmentVersionId)
        throw new Error("Training must have a published final knowledge check");
      const [previous]=await tx.select().from(noncreditCompletionPolicies)
        .where(eq(noncreditCompletionPolicies.trainingVersionId,training.id))
        .orderBy(desc(noncreditCompletionPolicies.policyVersion)).limit(1);
      if((previous?.policyVersion??null)!==data.expectedLatestPolicyVersion)
        throw new Error("Completion policy version changed; reload before publishing");
      const [policy]=await tx.insert(noncreditCompletionPolicies).values({
        trainingVersionId:training.id,policyVersion:(previous?.policyVersion??0)+1,
        minParticipationMinutes:data.minParticipationMinutes,
        requireAllLessons:data.requireAllLessons,
        skillsAssessmentRequired:data.skillsAssessmentRequired,
        minimumAssessmentFraction:data.minimumAssessmentFraction===null
          ?null:data.minimumAssessmentFraction.toFixed(5),
        completionMode:data.completionMode,
        effectiveAt:new Date(),approvedByPersonId:actor.actorPersonId,
        publishedAt:new Date(),
      }).returning();
      if(!policy)throw new Error("Completion policy could not be published");
      const payload={trainingVersionId:training.id,policyId:policy.id,
        policyVersion:policy.policyVersion,completionMode:policy.completionMode};
      await tx.insert(auditEvents).values({
        actorPersonId:actor.actorPersonId,
        owningOrganizationId:training.providerOrganizationId,
        eventCode:"noncredit.completion_policy.published",
        entityKind:"noncredit_completion_policy",entityId:policy.id,payload,
      });
      await tx.insert(domainEvents).values({
        eventType:"NoncreditCompletionPolicyPublished",
        aggregateType:"noncredit_completion_policy",aggregateId:policy.id,
        actorPersonId:actor.actorPersonId,payload,
      });
      return {policyId:policy.id,policyVersion:policy.policyVersion,
        completionMode:policy.completionMode,
        appliesTo:"future_registrations" as const};
    });
  });

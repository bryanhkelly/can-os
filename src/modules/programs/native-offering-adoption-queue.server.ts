import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { auditEvents as sharedAuditEvents } from "@/db/schema";
import {
  blueprintConfigurationOfferingIntents, blueprintConfigurationVersions, blueprintExecutionBatches,
  blueprintOutputs, canonicalOfferingCourses, catalogSites, configurationReviews,
  courseVersions, deploymentOfferingAdoptions, deploymentReadinessReviews,
  educationOperationOrganizationRoles, educationOperationSites, educationOperations,
  evidenceDocumentVersions, offeringVersions, offerings, programDeployments,
  siteOrganizationRoles, classroomDeploymentSites,
} from "@/db/canonical-v301";
import { assertCapability, AuthorizationError, type CommandContext } from
  "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { publisherReleaseAvailableForAdoption } from "@/domain/native-offering-adoption-publication";
import { nativeAdoptionReviewKinds } from "@/domain/native-adoption-readiness";
import { isVerifiedEvidenceCurrent } from "@/domain/instructional-tracks";
import { canonicalSessionRowSchema, projectCanonicalCommandContext } from
  "@/domain/canonical-access";
import {
  canonicalSessionDigestFromRequest, getCanonicalCommandContext,
} from "@/modules/identity/canonical-command-context.server";
import { writeCanonicalAudit, emitCanonicalDomainEvent } from
  "@/platform/canonical-mutation.server";

const uuid=z.string().uuid();
function invalid(reason:string):never { throw new DomainError("VALIDATION_FAILED",reason); }
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

import {reviewerScope} from "./native-offering-adoption-scope.server";

/**
 * Existing canonical Blueprint review authority, not an invented approval role.
 * The queue is limited to proposed adoptions under the reviewer's single
 * Organization and its currently approved operation-operator relationships.
 */
export async function getNativeOfferingAdoptionReviewQueueService(request:Request){
    const actor=await getCanonicalCommandContext(request);
    const organizationId=reviewerScope(actor);
    const now=new Date();
    const rows=await db.select({
      adoptionId:deploymentOfferingAdoptions.id,
      deploymentId:deploymentOfferingAdoptions.deploymentId,
      offeringVersionId:offeringVersions.id,
      title:offerings.title,versionNo:offeringVersions.versionNo,
      lifecycle:offeringVersions.lifecycle,
      publishedAt:offeringVersions.publishedAt,
      offeringStatus:offerings.status,
      deploymentName:programDeployments.name,
      deploymentState:programDeployments.status,
      operationState:educationOperations.status,
      approvalStatus:deploymentOfferingAdoptions.approvalStatus,
    }).from(deploymentOfferingAdoptions)
      .innerJoin(programDeployments,eq(programDeployments.id,
        deploymentOfferingAdoptions.deploymentId))
      .innerJoin(educationOperations,eq(educationOperations.id,programDeployments.operationId))
      .innerJoin(educationOperationOrganizationRoles,and(
        eq(educationOperationOrganizationRoles.operationId,programDeployments.operationId),
        eq(educationOperationOrganizationRoles.organizationId,organizationId),
        eq(educationOperationOrganizationRoles.roleCode,"operator"),
        eq(educationOperationOrganizationRoles.status,"approved"),
        lte(educationOperationOrganizationRoles.validFrom,now),
        or(isNull(educationOperationOrganizationRoles.validThrough),
          gt(educationOperationOrganizationRoles.validThrough,now)),
      ))
      .innerJoin(offeringVersions,eq(offeringVersions.id,
        deploymentOfferingAdoptions.offeringVersionId))
      .innerJoin(offerings,eq(offerings.id,offeringVersions.offeringId))
      .where(eq(deploymentOfferingAdoptions.approvalStatus,"proposed"))
      .orderBy(desc(deploymentOfferingAdoptions.validFrom))
      .limit(61);
    // Scope the evidence preview to the exact proposed adoptions already
    // returned under the reviewer's Organization. This is diagnostic only:
    // an executed batch is not an independently approved Blueprint, and
    // a recorded "ready" outcome is not proof of current verified evidence.
    const visible=rows.slice(0,60);
    if(!visible.length)return {items:[],limited:rows.length>60};
    const deploymentIds=[...new Set(visible.map(item=>item.deploymentId))];
    const [outputs,reviews]=await Promise.all([
      db.select({
        deploymentId:blueprintOutputs.deploymentId,
        offeringVersionId:blueprintConfigurationOfferingIntents.offeringVersionId,
      }).from(blueprintOutputs)
        .innerJoin(blueprintExecutionBatches,eq(
          blueprintExecutionBatches.id,blueprintOutputs.executionBatchId))
        .innerJoin(blueprintConfigurationOfferingIntents,and(
          eq(blueprintConfigurationOfferingIntents.configurationVersionId,
            blueprintExecutionBatches.configurationVersionId),
        ))
        .where(and(
          inArray(blueprintOutputs.deploymentId,deploymentIds),
          inArray(blueprintConfigurationOfferingIntents.offeringVersionId,
            [...new Set(visible.map(item=>item.offeringVersionId))]),
          eq(blueprintExecutionBatches.executingOrganizationId,organizationId),
          eq(blueprintExecutionBatches.executionStatus,"executed"),
        )).limit(121),
      db.select({
        deploymentId:deploymentReadinessReviews.deploymentId,
        kind:deploymentReadinessReviews.reviewKind,
        outcome:deploymentReadinessReviews.outcome,
        expiresAt:deploymentReadinessReviews.expiresAt,
      }).from(deploymentReadinessReviews)
        .where(inArray(deploymentReadinessReviews.deploymentId,deploymentIds))
        .orderBy(desc(deploymentReadinessReviews.evaluatedAt),
          desc(deploymentReadinessReviews.id)).limit(601),
    ]);
    const evidenceLimited=outputs.length>120||reviews.length>600;
    const outputKeys=new Set(outputs.slice(0,120).map(row=>
      row.deploymentId+":"+row.offeringVersionId));
    const latestReview=new Map<string,(typeof reviews)[number]>();
    for(const item of reviews.slice(0,600)){
      const key=item.deploymentId+":"+item.kind;
      if(!latestReview.has(key))latestReview.set(key,item);
    }
    const items=visible.map(item=>{
      const reviewStates=nativeAdoptionReviewKinds.map(kind=>{
        const review=latestReview.get(item.deploymentId+":"+kind);
        return {kind,
          recordedReady:Boolean(review&&review.outcome==="ready"&&
            (!review.expiresAt||review.expiresAt>now))};
      });
      return {...item,
        blueprintExecutionRecorded:!evidenceLimited&&
          outputKeys.has(item.deploymentId+":"+item.offeringVersionId),
        readiness:reviewStates,
        evidencePreviewLimited:evidenceLimited,
      };
    });
    return {items,limited:rows.length>60||evidenceLimited};
}

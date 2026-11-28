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
export const approvalInput=z.object({
  adoptionId:uuid,evidenceVersionId:uuid,
  rationale:z.string().trim().min(10).max(2000),
}).strict();
function invalid(reason:string):never { throw new DomainError("VALIDATION_FAILED",reason); }
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

import {reviewerScope} from "./native-offering-adoption-scope.server";

/** Revalidate the native session inside the SAME transaction as the mutation.
 * Organization-only reviewer grants cannot be inferred from publisher accounts
 * or from a Site Admin's editable Blueprint. */
async function revalidateReviewer(tx:Tx,request:Request,actor:CommandContext){
  const digest=canonicalSessionDigestFromRequest(request);
  const record=await tx.execute(sql`
    SELECT account_id,session_id,grant_id,person_id,role_code,organization_id,site_id
    FROM education_v30.v301_canonical_session_context(${digest}::text)
  `);
  if(record.rows.length!==1)throw new AuthorizationError("current independent reviewer session");
  const current=projectCanonicalCommandContext(canonicalSessionRowSchema.parse(record.rows[0]));
  if(current.actorPersonId!==actor.actorPersonId||current.role!==actor.role||
    current.scope.organizationIds?.[0]!==actor.scope.organizationIds?.[0]||
    current.scope.siteIds?.length!==0)
    throw new AuthorizationError("unchanged independent reviewer appointment");
}

/** Verify a real evidence document version, not a caller's claimed approval. */
async function verifiedEvidence(tx:Tx,id:string){
  const [record]=await tx.select({
    verifiedAt:evidenceDocumentVersions.verifiedAt,
    verifiedByPersonId:evidenceDocumentVersions.verifiedByPersonId,
    validFrom:evidenceDocumentVersions.validFrom,
    validThrough:evidenceDocumentVersions.validThrough,
  }).from(evidenceDocumentVersions).where(eq(evidenceDocumentVersions.id,id)).limit(1);
  if(!record||!isVerifiedEvidenceCurrent({...record,at:new Date()}))
    invalid("Independent adoption decision requires current verified evidence.");
}

/**
 * Existing canonical Blueprint review authority, not an invented approval role.
 * The queue is limited to proposed adoptions under the reviewer's single
 * Organization and its currently approved operation-operator relationships.
 */
export async function approveNativeOfferingAdoptionService(request:Request,raw:unknown){
 const data=approvalInput.parse(raw);
    const actor=await getCanonicalCommandContext(request);
    const organizationId=reviewerScope(actor);
    const reviewerPersonId=actor.actorPersonId!;
    return db.transaction(async tx=>{
      const [adoption]=await tx.select().from(deploymentOfferingAdoptions)
        .where(eq(deploymentOfferingAdoptions.id,data.adoptionId)).for("update").limit(1);
      if(!adoption||adoption.approvalStatus!=="proposed")
        throw new AuthorizationError("current proposed adoption");
      const [deployment]=await tx.select().from(programDeployments)
        .where(eq(programDeployments.id,adoption.deploymentId)).limit(1);
      const [version]=await tx.select().from(offeringVersions)
        .where(eq(offeringVersions.id,adoption.offeringVersionId)).limit(1);
      const [offering]=await tx.select().from(offerings)
        .where(eq(offerings.id,adoption.offeringId)).limit(1);
      if(!deployment||!version||!offering||
        deployment.offeringId!==offering.id||version.offeringId!==offering.id||
        !publisherReleaseAvailableForAdoption({
          lifecycle:version.lifecycle,publishedAt:version.publishedAt,
          offeringStatus:offering.status,
        })||
        ["suspended","closed"].includes(deployment.status))
        invalid("Only the exact published Offering may be considered for adoption.");
      if(adoption.validThrough&&adoption.validThrough<=new Date())
        invalid("The proposed adoption period has already ended.");
      const [operation]=await tx.select().from(educationOperations)
        .where(eq(educationOperations.id,deployment.operationId)).limit(1);
      if(!operation||!["planning","active"].includes(operation.status))
        invalid("The proposed Operation is closed or paused.");
      const now=new Date();
      const [operator]=await tx.select({
        id:educationOperationOrganizationRoles.id,
      }).from(educationOperationOrganizationRoles).where(and(
        eq(educationOperationOrganizationRoles.operationId,operation.id),
        eq(educationOperationOrganizationRoles.organizationId,organizationId),
        eq(educationOperationOrganizationRoles.roleCode,"operator"),
        eq(educationOperationOrganizationRoles.status,"approved"),
        lte(educationOperationOrganizationRoles.validFrom,now),
        or(isNull(educationOperationOrganizationRoles.validThrough),
          gt(educationOperationOrganizationRoles.validThrough,now)),
      )).limit(1);
      if(!operator)throw new AuthorizationError("current operating Organization authority");
      const courseRows=await tx.select({
        courseVersionId:courseVersions.id,lifecycle:courseVersions.lifecycle,
        publishedAt:courseVersions.publishedAt,
      }).from(canonicalOfferingCourses)
        .innerJoin(courseVersions,eq(courseVersions.id,
          canonicalOfferingCourses.courseVersionId))
        .where(eq(canonicalOfferingCourses.offeringVersionId,adoption.offeringVersionId))
        .limit(51);
      if(!courseRows.length||courseRows.length>50||courseRows.some(row=>
        row.lifecycle!=="published"||!row.publishedAt))
        invalid("Every constituent native Course must be independently published.");
      const activeSites=await tx.select({id:educationOperationSites.siteId})
        .from(educationOperationSites).where(and(
          eq(educationOperationSites.operationId,operation.id),
          lte(educationOperationSites.validFrom,now),
          or(isNull(educationOperationSites.validThrough),gt(educationOperationSites.validThrough,now)),
        )).limit(101);
      if(!activeSites.length||activeSites.length>100)
        invalid("An approved Operation needs a bounded set of current Sites.");
      const ids=[...new Set(activeSites.map(site=>site.id))];
      if(ids.length!==activeSites.length)
        invalid("Duplicate Operation/Site relationships require reconciliation.");
      const authorized=await tx.select({id:catalogSites.id})
        .from(catalogSites)
        .innerJoin(siteOrganizationRoles,and(
          eq(siteOrganizationRoles.siteId,catalogSites.id),
          eq(siteOrganizationRoles.organizationId,organizationId),
          inArray(siteOrganizationRoles.roleCode,["operator","host"]),
          lte(siteOrganizationRoles.validFrom,now),
          or(isNull(siteOrganizationRoles.validThrough),gt(siteOrganizationRoles.validThrough,now)),
        ))
        .where(and(inArray(catalogSites.id,ids),eq(catalogSites.status,"active")))
        .limit(101);
      if(ids.some(id=>!authorized.some(site=>site.id===id)))
        invalid("Every Site must have a current approved operating relationship.");
      const placement=await tx.select({siteId:classroomDeploymentSites.siteId})
        .from(classroomDeploymentSites).where(eq(classroomDeploymentSites.deploymentId,deployment.id))
        .limit(101);
      if(!placement.length||placement.length>100||
        placement.some(site=>!ids.includes(site.siteId)))
        invalid("Deployment placements must match current authorized Operation Sites.");
      // Only a real, independently reviewed Blueprint execution can be
      // approved here. Synthetic seeded or manual proposals are NOT evidence.
      const [provenance]=await tx.select({
        batchId:blueprintExecutionBatches.id,
        configurationVersionId:blueprintExecutionBatches.configurationVersionId,
        reviewId:blueprintExecutionBatches.reviewId,
        executedByPersonId:blueprintExecutionBatches.executedByPersonId,
      }).from(blueprintOutputs)
        .innerJoin(blueprintExecutionBatches,eq(
          blueprintExecutionBatches.id,blueprintOutputs.executionBatchId))
        .innerJoin(blueprintConfigurationOfferingIntents,and(
          eq(blueprintConfigurationOfferingIntents.configurationVersionId,
            blueprintExecutionBatches.configurationVersionId),
          eq(blueprintConfigurationOfferingIntents.offeringVersionId,
            adoption.offeringVersionId),
        ))
        .where(and(
          eq(blueprintOutputs.deploymentId,deployment.id),
          eq(blueprintExecutionBatches.executingOrganizationId,organizationId),
          eq(blueprintExecutionBatches.executionStatus,"executed"),
        )).limit(1);
      if(!provenance||!provenance.executedByPersonId||
        provenance.executedByPersonId===reviewerPersonId)
        throw new AuthorizationError("independently prepared exact-version Blueprint execution");
      const [latestReview]=await tx.select({
        id:configurationReviews.id,decision:configurationReviews.decision,
        reviewerPersonId:configurationReviews.reviewerPersonId,
      }).from(configurationReviews)
        .where(eq(configurationReviews.configurationVersionId,
          provenance.configurationVersionId))
        .orderBy(desc(configurationReviews.decidedAt),desc(configurationReviews.id)).limit(1);
      if(!latestReview||latestReview.id!==provenance.reviewId||
        latestReview.decision!=="approved")
        invalid("Current approved Blueprint execution review is required.");
      const [configuration]=await tx.select({id:blueprintConfigurationVersions.configurationId})
        .from(blueprintConfigurationVersions)
        .where(eq(blueprintConfigurationVersions.id,provenance.configurationVersionId)).limit(1);
      if(!configuration)invalid("Blueprint configuration provenance is incomplete.");
      const authorEvents=await tx.select({personId:sharedAuditEvents.actorPersonId})
        .from(sharedAuditEvents).where(and(
          eq(sharedAuditEvents.resourceType,"blueprint_configuration"),
          eq(sharedAuditEvents.resourceId,configuration.id),
          inArray(sharedAuditEvents.action,[
            "blueprint.configuration.created","blueprint.configuration.saved",
            "blueprint.configuration.submitted",
          ]),
        )).limit(1001);
      // No self-approval, unverified origin, or truncated author evidence.
      if(!authorEvents.length||authorEvents.length>1000||
        authorEvents.some(event=>event.personId===reviewerPersonId))
        throw new AuthorizationError("reviewer must be independent of all Blueprint authors");
      const readiness=await tx.select().from(deploymentReadinessReviews)
        .where(eq(deploymentReadinessReviews.deploymentId,deployment.id))
        .orderBy(desc(deploymentReadinessReviews.evaluatedAt),
          desc(deploymentReadinessReviews.id)).limit(61);
      if(readiness.length>60)
        invalid("Deployment review history requires explicit reconciliation.");
      for(const kind of nativeAdoptionReviewKinds){
        const review=readiness.find(item=>item.reviewKind===kind);
        if(!review||review.outcome!=="ready"||review.evaluatedAt>now||
          review.evaluatedByPersonId===reviewerPersonId||
          (review.expiresAt&&review.expiresAt<=now))
          invalid("Independent, unexpired operating, registration and delivery readiness is required.");
        await verifiedEvidence(tx,review.evidenceVersionId);
      }
      await verifiedEvidence(tx,data.evidenceVersionId);
      await revalidateReviewer(tx,request,actor);
      const [approved]=await tx.update(deploymentOfferingAdoptions)
        .set({approvalStatus:"approved",approvedByPersonId:reviewerPersonId,
          approvedAt:now})
        .where(and(eq(deploymentOfferingAdoptions.id,adoption.id),
          eq(deploymentOfferingAdoptions.approvalStatus,"proposed")))
        .returning({id:deploymentOfferingAdoptions.id});
      if(!approved)throw new DomainError("CONFLICT","Adoption changed during review.");
      await writeCanonicalAudit(tx,{
        actorPersonId:reviewerPersonId,owningOrganizationId:organizationId,
        eventCode:"native.offering.adoption.approved",entityKind:"deployment_offering_adoption",
        entityId:adoption.id,payload:{
          exactOfferingVersionId:adoption.offeringVersionId,deploymentId:deployment.id,
          blueprintExecutionBatchId:provenance.batchId,
          evidenceVersionId:data.evidenceVersionId,rationale:data.rationale,
        },
      });
      await emitCanonicalDomainEvent(tx,{
        eventType:"NativeOfferingAdoptionApproved",aggregateType:"deployment_offering_adoption",
        aggregateId:adoption.id,actorPersonId:reviewerPersonId,
        payload:{deploymentId:deployment.id,offeringVersionId:adoption.offeringVersionId},
      });
      return {adoptionId:approved.id,approvalStatus:"approved" as const,
        deploymentStatusUnchanged:deployment.status};
    });
}

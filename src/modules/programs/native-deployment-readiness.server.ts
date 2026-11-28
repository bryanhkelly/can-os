import {and,desc,eq,sql} from "drizzle-orm";
import {db} from "@/db/client";
import {deploymentReadinessReviews,programDeployments,evidenceDocuments,evidenceDocumentVersions} from "@/db/canonical-v301";
import {getIdentityContext} from "@/modules/identity/command-context.server";
import {assertCurrentCANGrantForMutation} from "@/modules/identity/current-can-grant-transaction.server";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {DomainError} from "@/domain/errors";
import {deploymentReadinessCommand,sameDeploymentReadinessReceipt} from "@/domain/native-deployment-readiness";
import {isVerifiedEvidenceCurrent} from "@/domain/instructional-tracks";
import {writeCanonicalAudit,emitCanonicalDomainEvent} from "@/platform/canonical-mutation.server";

/** Direct independent CAN reviewer; this records evidence, not operating authority. */
export async function recordNativeDeploymentReadinessService(request:Request,raw:unknown){
 const data=deploymentReadinessCommand.parse(raw);
  if(request.headers.get("origin")!==new URL(request.url).origin)
    throw new AuthorizationError("same-origin independent readiness decision");
  const actor=await getIdentityContext(request);
  assertCapability(actor,"deployment.readiness.review");
  if(actor.role!=="deployment_readiness_reviewer"||!actor.actorPersonId||
     actor.grantSiteId!==null||actor.scope.organizationIds?.length!==1||
     actor.delegatedByPlatformOwner||actor.sessionAccountId||actor.impersonatedByAccountId)
    throw new AuthorizationError("direct Organization readiness reviewer");
  const organizationId=actor.scope.organizationIds[0]!,personId=actor.actorPersonId;
  return db.transaction(async tx=>{
    await assertCurrentCANGrantForMutation(tx,request,actor,{roles:["deployment_readiness_reviewer"],organizationId,siteId:null});
    const [deployment]=await tx.select().from(programDeployments)
      .where(eq(programDeployments.id,data.deploymentId)).for("update").limit(1);
    if(!deployment||!["planning","review","authorized"].includes(deployment.status))
      throw new AuthorizationError("deployment awaiting operational approval");
    const scope=await tx.execute(sql`
      SELECT DISTINCT b.id FROM public.program_deployments d
      JOIN public.education_operations op ON op.id=d.operation_id
      JOIN public.education_operation_organization_roles r ON r.operation_id=op.id
      JOIN public.blueprint_outputs bo ON bo.deployment_id=d.id
      JOIN public.blueprint_execution_batches b ON b.id=bo.execution_batch_id
      JOIN public.blueprint_configuration_versions v ON v.id=b.configuration_version_id
      JOIN public.blueprint_configurations c ON c.id=v.configuration_id
      JOIN public.configuration_reviews cr ON cr.id=b.review_id AND cr.configuration_version_id=v.id
      JOIN public.education_operation_sites os ON os.operation_id=op.id
      JOIN public.sites s ON s.id=os.site_id
      JOIN public.site_organization_roles sr ON sr.site_id=s.id
      JOIN public.deployment_sites ds ON ds.deployment_id=d.id AND ds.site_id=s.id AND ds.purpose='instruction'
      JOIN public.deployment_offering_adoptions a ON a.deployment_id=d.id AND a.offering_id=d.offering_id
      JOIN public.offering_versions ov ON ov.id=a.offering_version_id AND ov.offering_id=d.offering_id
      JOIN public.offerings o ON o.id=ov.offering_id
      JOIN public.blueprint_configuration_offering_intents i ON i.configuration_version_id=v.id AND i.offering_version_id=ov.id
      WHERE d.id=${data.deploymentId}::uuid AND op.status IN ('planning','active')
        AND r.organization_id=${organizationId}::uuid AND r.role_code='operator' AND r.status='approved'
        AND r.valid_from<=clock_timestamp() AND (r.valid_through IS NULL OR r.valid_through>clock_timestamp())
        AND b.executing_organization_id=r.organization_id AND b.execution_status='executed'
        AND c.owning_organization_id=r.organization_id AND v.lifecycle='frozen'
        AND bo.configuration_version_id=v.id AND bo.review_id=cr.id
        AND cr.decision='approved' AND cr.decided_at<=clock_timestamp()
        AND cr.reviewer_person_id<>b.executed_by_person_id AND b.executed_by_person_id<>${personId}::uuid
        AND s.organization_id=r.organization_id AND s.lifecycle_status='active' AND v.config->>'siteId'=s.id::text
        AND sr.organization_id=r.organization_id AND sr.role_code IN ('host','operator')
        AND sr.valid_from<=clock_timestamp() AND (sr.valid_through IS NULL OR sr.valid_through>clock_timestamp())
        AND os.valid_from<=clock_timestamp() AND (os.valid_through IS NULL OR os.valid_through>clock_timestamp())
        AND a.approval_status='proposed' AND a.valid_from<=clock_timestamp()
        AND (a.valid_through IS NULL OR a.valid_through>clock_timestamp())
        AND ov.lifecycle='published' AND ov.published_at IS NOT NULL AND o.status='active'
        AND EXISTS(SELECT 1 FROM public.blueprint_outputs oo WHERE oo.execution_batch_id=b.id AND oo.operation_id=op.id)
        AND NOT EXISTS(SELECT 1 FROM public.deployment_sites other WHERE other.deployment_id=d.id AND other.site_id<>s.id)
        AND NOT EXISTS(SELECT 1 FROM public.blueprint_configuration_versions newer WHERE newer.configuration_id=v.configuration_id AND newer.revision>v.revision)
        AND NOT EXISTS(SELECT 1 FROM public.configuration_reviews newer WHERE newer.configuration_version_id=v.id AND (newer.decided_at,newer.id)>(cr.decided_at,cr.id))
        AND EXISTS(SELECT 1 FROM public.audit_events e WHERE e.resource_type='blueprint_configuration' AND e.resource_id=c.id
          AND e.action IN ('blueprint.configuration.created','blueprint.configuration.saved','blueprint.configuration.submitted'))
        AND NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.resource_type='blueprint_configuration' AND e.resource_id=c.id
          AND e.action IN ('blueprint.configuration.created','blueprint.configuration.saved','blueprint.configuration.submitted')
          AND e.actor_person_id=${personId}::uuid)
    `);
    if(scope.rows.length!==1)throw new AuthorizationError("independent current Blueprint deployment readiness scope");
    const [prior]=await tx.select().from(deploymentReadinessReviews).where(eq(deploymentReadinessReviews.id,data.reviewId)).limit(1);
    if(prior){
      if(!sameDeploymentReadinessReceipt(prior,data,personId))throw new DomainError("CONFLICT","Readiness review identifier already used.");
      return {reviewId:prior.id,deploymentId:data.deploymentId,created:false};
    }
    const now=new Date(),expiresAt=new Date(data.expiresAt);
    const [evidence]=await tx.select({verifiedAt:evidenceDocumentVersions.verifiedAt,
      verifiedByPersonId:evidenceDocumentVersions.verifiedByPersonId,validFrom:evidenceDocumentVersions.validFrom,
      validThrough:evidenceDocumentVersions.validThrough})
      .from(evidenceDocumentVersions).innerJoin(evidenceDocuments,eq(evidenceDocuments.id,evidenceDocumentVersions.documentId))
      .where(and(eq(evidenceDocumentVersions.id,data.evidenceVersionId),eq(evidenceDocuments.owningOrganizationId,organizationId))).limit(1);
    if(!evidence||!isVerifiedEvidenceCurrent({...evidence,at:now})||evidence.verifiedByPersonId===personId||
       expiresAt<=now||(evidence.validThrough&&expiresAt.toISOString().slice(0,10)>evidence.validThrough))
      throw new DomainError("VALIDATION_FAILED","Current independently verified Organization evidence and a valid review expiry are required.");
    const [latest]=await tx.select().from(deploymentReadinessReviews).where(and(
      eq(deploymentReadinessReviews.deploymentId,data.deploymentId),eq(deploymentReadinessReviews.reviewKind,data.reviewKind)))
      .orderBy(desc(deploymentReadinessReviews.evaluatedAt),desc(deploymentReadinessReviews.id)).limit(1);
    if((latest?.id??null)!==data.supersedesId||latest&&latest.evaluatedAt>now)
      throw new DomainError("CONFLICT","Review changed. Reconcile the latest decision before submitting.");
    const [created]=await tx.insert(deploymentReadinessReviews).values({id:data.reviewId,
      deploymentId:data.deploymentId,reviewKind:data.reviewKind,outcome:data.outcome,evidenceVersionId:data.evidenceVersionId,
      evaluatedByPersonId:personId,evaluatedAt:now,expiresAt,supersedesId:data.supersedesId})
      .onConflictDoNothing({target:deploymentReadinessReviews.id}).returning({id:deploymentReadinessReviews.id});
    if(!created)throw new DomainError("CONFLICT","Readiness review identifier already used.");
    const payload={deploymentId:data.deploymentId,reviewKind:data.reviewKind,outcome:data.outcome,
      evidenceVersionId:data.evidenceVersionId,expiresAt:expiresAt.toISOString(),supersedesId:data.supersedesId};
    await writeCanonicalAudit(tx,{actorPersonId:personId,owningOrganizationId:organizationId,eventCode:"deployment.readiness.reviewed",
      entityKind:"deployment_readiness_review",entityId:created.id,payload});
    await emitCanonicalDomainEvent(tx,{actorPersonId:personId,eventType:"DeploymentReadinessReviewed",aggregateType:"deployment_readiness_review",
      aggregateId:created.id,payload});
    return {reviewId:created.id,deploymentId:data.deploymentId,created:true};
  });
}

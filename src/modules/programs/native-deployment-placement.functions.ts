import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {and,eq,sql} from "drizzle-orm";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {db} from "@/db/client";
import {programDeployments,classroomDeploymentSites} from "@/db/canonical-v301";
import {AuthorizationError} from "@/domain/command-context";
import {DomainError} from "@/domain/errors";
import {requireCanonicalLabProvider} from "@/modules/operations/canonical-capability-lab-access.server";
import {assertCurrentCanonicalStaffForMutation} from "@/modules/identity/canonical-transaction-authorization.server";
import {writeCanonicalAudit,emitCanonicalDomainEvent} from "@/platform/canonical-mutation.server";

const inputSchema=z.object({deploymentId:z.string().uuid(),siteId:z.string().uuid()}).strict();

/** Place the exact Site of an executed, independently approved Blueprint.
 * Placement is planning metadata, NOT an operating, registration, delivery
 * or adoption authorization. The same current staff grant and audit contract
 * applies to every caller, including Launch Studio and acceptance clients.
 * Never infer placement from a Site ID supplied by the browser alone. */
export const placeNativeDeploymentSite=createServerFn({method:"POST"})
 .validator((raw:unknown)=>inputSchema.parse(raw))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const request=getRequest();
  const provider=await requireCanonicalLabProvider("blueprint.execute");
  if(provider.siteIds.length!==1||provider.siteIds[0]!==data.siteId)
    throw new AuthorizationError("exact current Blueprint Site scope");
  return db.transaction(async tx=>{
    // Current operator + Site + immutable Blueprint execution provenance.
    // Every comparison is against the persisted canonical records.
    const scope=await tx.execute(sql`
      SELECT DISTINCT d.id FROM public.program_deployments d
      JOIN public.education_operations op ON op.id=d.operation_id
      JOIN public.education_operation_organization_roles r ON r.operation_id=op.id
      JOIN public.education_operation_sites os ON os.operation_id=op.id
      JOIN public.sites s ON s.id=os.site_id
      JOIN public.site_organization_roles sr ON sr.site_id=s.id
      JOIN public.blueprint_outputs bo ON bo.deployment_id=d.id
      JOIN public.blueprint_execution_batches b ON b.id=bo.execution_batch_id
      JOIN public.blueprint_configuration_versions v ON v.id=b.configuration_version_id
      JOIN public.blueprint_configurations c ON c.id=v.configuration_id
      JOIN public.configuration_reviews cr ON cr.id=b.review_id AND cr.configuration_version_id=v.id
      WHERE d.id=${data.deploymentId}::uuid AND s.id=${data.siteId}::uuid
        AND s.organization_id=${provider.organizationId}::uuid AND s.lifecycle_status='active'
        AND op.status IN ('planning','active') AND r.organization_id=${provider.organizationId}::uuid
        AND r.role_code='operator' AND r.status='approved'
        AND r.valid_from<=clock_timestamp() AND (r.valid_through IS NULL OR r.valid_through>clock_timestamp())
        AND os.valid_from<=clock_timestamp() AND (os.valid_through IS NULL OR os.valid_through>clock_timestamp())
        AND sr.organization_id=r.organization_id AND sr.role_code IN ('operator','host')
        AND sr.valid_from<=clock_timestamp() AND (sr.valid_through IS NULL OR sr.valid_through>clock_timestamp())
        AND b.execution_status='executed' AND b.executing_organization_id=r.organization_id
        AND c.owning_organization_id=r.organization_id AND v.lifecycle='frozen'
        AND bo.configuration_version_id=v.id AND bo.review_id=cr.id
        AND v.config->>'siteId'=s.id::text AND cr.decision='approved'
        AND cr.decided_at<=clock_timestamp() AND cr.reviewer_person_id<>b.executed_by_person_id
        AND EXISTS (SELECT 1 FROM public.blueprint_outputs oo WHERE oo.execution_batch_id=b.id AND oo.operation_id=op.id)
        AND NOT EXISTS (SELECT 1 FROM public.blueprint_configuration_versions newer
          WHERE newer.configuration_id=v.configuration_id AND newer.revision>v.revision)
        AND NOT EXISTS (SELECT 1 FROM public.configuration_reviews newer
          WHERE newer.configuration_version_id=v.id AND (newer.decided_at,newer.id)>(cr.decided_at,cr.id))
    `);
    if(scope.rows.length!==1)throw new AuthorizationError("current independently reviewed Blueprint deployment at this Site");
    const [deployment]=await tx.select({id:programDeployments.id,status:programDeployments.status})
      .from(programDeployments).where(eq(programDeployments.id,data.deploymentId)).for("update").limit(1);
    if(!deployment||!["planning","review","authorized","active"].includes(deployment.status))
      throw new AuthorizationError("current planning or operational deployment");
    // Revalidate after the lock, before every write or retry receipt.
    await assertCurrentCanonicalStaffForMutation(tx,request,provider.actor);
    const existing=await tx.select({id:classroomDeploymentSites.id}).from(classroomDeploymentSites)
      .where(and(eq(classroomDeploymentSites.deploymentId,data.deploymentId),
        eq(classroomDeploymentSites.siteId,data.siteId),eq(classroomDeploymentSites.purpose,"instruction"))).limit(2);
    if(existing.length>1)throw new DomainError("CONFLICT","Ambiguous deployment placement.");
    if(existing[0])return {deploymentId:data.deploymentId,siteId:data.siteId,placementId:existing[0].id,created:false};
    if(!["planning","review"].includes(deployment.status))
      throw new DomainError("CONFLICT","New placement requires a planning or review deployment.");
    const [placement]=await tx.insert(classroomDeploymentSites)
      .values({id:randomUUID(),deploymentId:data.deploymentId,siteId:data.siteId,purpose:"instruction"})
      .returning({id:classroomDeploymentSites.id});
    if(!placement)throw new DomainError("CONFLICT","Placement could not be created.");
    const payload={deploymentId:data.deploymentId,siteId:data.siteId,purpose:"instruction"};
    await writeCanonicalAudit(tx,{actorPersonId:provider.actor.actorPersonId!,owningOrganizationId:provider.organizationId,
      eventCode:"deployment.site.placed",entityKind:"deployment_site",entityId:placement.id,payload});
    await emitCanonicalDomainEvent(tx,{actorPersonId:provider.actor.actorPersonId!,eventType:"DeploymentSitePlaced",
      aggregateType:"deployment_site",aggregateId:placement.id,payload});
    return {deploymentId:data.deploymentId,siteId:data.siteId,placementId:placement.id,created:true};
  });
 });

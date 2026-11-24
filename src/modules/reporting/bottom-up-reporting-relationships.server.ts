import {sql} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {getIdentityContext} from "@/modules/identity/command-context.server";
import {AuthorizationError} from "@/domain/command-context";
import {buildCurrentReportingMetricRegistry} from "@/domain/reporting-metric-registry";
import {
  assertRelationshipActor,relationshipProposalSchema,transitionRelationship,validateRelationshipProposal,
  type RelationshipAction,type RelationshipMetric,type RelationshipProposal,
  type ReportingRelationship,type VerifiedRelationshipScope,
} from "@/domain/bottom-up-reporting-relationships";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const uuid=z.string().uuid();
const iso=z.coerce.date().transform(value=>value.toISOString());
const rowSchema=relationshipProposalSchema.extend({
  id:uuid,ownerOrganizationId:uuid,proposedByPersonId:uuid,proposedAt:iso,
  validThrough:iso.nullable(),
  status:z.enum(["pending","accepted","declined","withdrawn","revoked"]),
  acceptedAt:iso.nullable(),acceptedByPersonId:uuid.nullable(),
});
const columns=sql`id,owner_organization_id AS "ownerOrganizationId",
  recipient_organization_id AS "recipientOrganizationId",scope_kind AS "scopeKind",
  scope_id AS "scopeId",relationship_kind AS "relationshipKind",metrics,
  valid_through AS "validThrough",proposed_at AS "proposedAt",
  proposed_by_person_id AS "proposedByPersonId",status,
  accepted_at AS "acceptedAt",accepted_by_person_id AS "acceptedByPersonId"`;
const scopeRow=z.object({ownerOrganizationId:uuid,siteId:uuid.nullable()}).strict();

/** Database-backed ownership, not a tenant or scope supplied by the browser.
 * Offering authorization is per contributing organization, never all adopting hosts. */
async function resolveScope(tx:Tx,scopeKind:RelationshipProposal["scopeKind"],scopeId:string,ownerHint:string):Promise<VerifiedRelationshipScope>{
  let query;
  switch(scopeKind){
    case "organization":
      query=sql`SELECT id AS "ownerOrganizationId",NULL::uuid AS "siteId"
        FROM public.organizations WHERE id=${scopeId}::uuid FOR SHARE`;break;
    case "site":
      query=sql`SELECT organization_id AS "ownerOrganizationId",id AS "siteId"
        FROM public.sites WHERE id=${scopeId}::uuid FOR SHARE`;break;
    case "program":
      query=sql`SELECT organization_id AS "ownerOrganizationId",site_id AS "siteId"
        FROM public.programs WHERE id=${scopeId}::uuid FOR SHARE`;break;
    case "offering":
      query=sql`SELECT ${ownerHint}::uuid AS "ownerOrganizationId",NULL::uuid AS "siteId"
        WHERE public.reporting_relationship_offering_owner(${scopeId}::uuid,${ownerHint}::uuid)`;break;
    case "class":
      query=sql`SELECT operating_organization_id AS "ownerOrganizationId",site_id AS "siteId"
        FROM public.classes WHERE id=${scopeId}::uuid FOR SHARE`;break;
  }
  const result=await tx.execute(query);
  const scope=scopeRow.safeParse(result.rows[0]);
  if(!scope.success)throw new AuthorizationError("verified reporting relationship source");
  return {...scope.data,scopeKind,scopeId};
}

/** Internal command only. approvedMetrics must come from trusted disclosure
 * governance, not request input. No route is enabled until the capability and
 * metric policies have been independently assigned and the schema verified. */
export async function proposeReportingRelationship(request:Request,input:unknown,
  approvedMetrics:readonly RelationshipMetric[]):Promise<ReportingRelationship>{
  const actor=await getIdentityContext(request);
  if(!actor.capabilities.has("relationships.propose")||actor.scope.organizationIds?.length!==1)
    throw new AuthorizationError("relationships.propose");
  const candidate=relationshipProposalSchema.parse(input);
  return db.transaction(async tx=>{
    const scope=await resolveScope(tx,candidate.scopeKind,candidate.scopeId,actor.scope.organizationIds![0]!);
    const person=assertRelationshipActor(actor,scope.ownerOrganizationId,"relationships.propose",scope.siteId);
    const proposal=validateRelationshipProposal(candidate,scope,buildCurrentReportingMetricRegistry(),approvedMetrics,new Date());
    const result=await tx.execute(sql`
      INSERT INTO public.reporting_relationship_agreements
        (owner_organization_id,recipient_organization_id,scope_kind,site_id,program_id,offering_id,class_id,
         relationship_kind,metrics,valid_through,proposed_by_person_id,last_action_by_person_id,last_action_organization_id)
      VALUES (${scope.ownerOrganizationId}::uuid,${proposal.recipientOrganizationId}::uuid,${proposal.scopeKind},
        ${proposal.scopeKind==="site"?proposal.scopeId:null}::uuid,
        ${proposal.scopeKind==="program"?proposal.scopeId:null}::uuid,
        ${proposal.scopeKind==="offering"?proposal.scopeId:null}::uuid,
        ${proposal.scopeKind==="class"?proposal.scopeId:null}::uuid,
        ${proposal.relationshipKind},${JSON.stringify(proposal.metrics)}::jsonb,${proposal.validThrough}::timestamptz,
        ${person}::uuid,${person}::uuid,${scope.ownerOrganizationId}::uuid)
      RETURNING ${columns}`);
    return rowSchema.parse(result.rows[0]);
  });
}
const actionInput=z.object({agreementId:uuid,action:z.enum(["accept","decline","withdraw","revoke"])}).strict();

/** Serialize decisions on the immutable proposal. The DB trigger records the
 * lifecycle event in the same transaction. No decision can modify scope. */
export async function decideReportingRelationship(request:Request,input:unknown):Promise<ReportingRelationship>{
  const actor=await getIdentityContext(request);
  const {agreementId,action}=actionInput.parse(input);
  const capability=action==="accept"||action==="decline"?"relationships.decide":"relationships.revoke";
  if(!actor.capabilities.has(capability)||actor.scope.organizationIds?.length!==1)
    throw new AuthorizationError(capability);
  const organizationId=actor.scope.organizationIds[0]!;
  return db.transaction(async tx=>{
    const result=await tx.execute(sql`
      SELECT ${columns} FROM public.reporting_relationship_agreements
      WHERE id=${agreementId}::uuid
        AND (owner_organization_id=${organizationId}::uuid OR recipient_organization_id=${organizationId}::uuid)
      FOR UPDATE`);
    if(!result.rows[0])throw new AuthorizationError("relationship party");
    const current=rowSchema.parse(result.rows[0]);
    // A prior owner may terminate its own agreement even after a source transfer
    // or expired adoption. Without current source authority require an org-wide grant.
    let scope:VerifiedRelationshipScope;
    try {
      scope=await resolveScope(tx,current.scopeKind,current.scopeId,current.ownerOrganizationId);
      if(scope.ownerOrganizationId!==current.ownerOrganizationId)
        throw new AuthorizationError("current relationship source owner");
    } catch(error) {
      if(!(error instanceof AuthorizationError)||(action!=="withdraw"&&action!=="revoke"))throw error;
      scope={ownerOrganizationId:current.ownerOrganizationId,scopeKind:current.scopeKind,
        scopeId:current.scopeId,siteId:null};
    }
    const next=transitionRelationship(current,action as RelationshipAction,actor,new Date(),scope);
    const updated=await tx.execute(sql`
      UPDATE public.reporting_relationship_agreements
      SET status=${next.status},
          accepted_at=CASE WHEN ${next.status}='accepted' THEN CURRENT_TIMESTAMP ELSE accepted_at END,
          accepted_by_person_id=${next.acceptedByPersonId}::uuid,
          last_action_at=CURRENT_TIMESTAMP,last_action_by_person_id=${actor.actorPersonId}::uuid,
          last_action_organization_id=${organizationId}::uuid
      WHERE id=${agreementId}::uuid
      RETURNING ${columns}`);
    return rowSchema.parse(updated.rows[0]);
  });
}

import {sql} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import type {AccessContext} from "@/domain/access-context";
import {LOCAL_DEMO_ADMIN} from "@/domain/local-demo-access";
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

/** Only a direct, independently provisioned organization-wide membership can
 * authorize initial relationship management. No automatic administrator grants.
 * Recheck and lock the live identity rows inside every command transaction. */
async function requireDirectRelationshipManager(tx:Tx,actor:AccessContext):Promise<string>{
  const organizationId=actor.scope.organizationIds?.[0];
  if(!organizationId||actor.scope.organizationIds?.length!==1||
    actor.role!=="reporting_relationship_manager"||actor.grantSiteId!==null||
    actor.impersonatedByAccountId||actor.delegatedByPlatformOwner||!actor.actorPersonId||
    organizationId===LOCAL_DEMO_ADMIN.organizationId)
    throw new AuthorizationError("direct organization reporting relationship manager");
  const result=await tx.execute(sql`
    SELECT g.id FROM public.account_person_grants g
    JOIN public.access_accounts a ON a.id=g.account_id AND a.person_id=g.person_id
    JOIN public.people p ON p.id=g.person_id
    JOIN public.organizations o ON o.id=g.organization_id
    JOIN public.access_sessions s ON s.active_grant_id=g.id AND s.account_id=a.id
    WHERE g.id=${actor.grantId}::uuid AND g.account_id=${actor.accountId}::uuid
      AND g.person_id=${actor.actorPersonId}::uuid AND g.organization_id=${organizationId}::uuid
      AND g.site_id IS NULL AND g.active AND g.role='reporting_relationship_manager'
      AND a.email_verified_at IS NOT NULL AND NOT a.disabled
      AND lower(a.email_normalized) NOT LIKE '%.demo' AND p.active AND o.lifecycle_status='active'
      AND s.id=${actor.sessionId}::uuid AND s.revoked_at IS NULL
      AND s.expires_at>CURRENT_TIMESTAMP AND s.delegated_grant_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.demo_school_tenants d WHERE d.organization_id=o.id)
    FOR SHARE OF g,a,p,o,s`);
  if(result.rows.length!==1)throw new AuthorizationError("current verified reporting relationship membership");
  return organizationId;
}
const recipientEligible=sql`g.role='reporting_relationship_manager' AND g.active
  AND g.site_id IS NULL AND a.person_id=g.person_id AND a.email_verified_at IS NOT NULL
  AND NOT a.disabled AND p.active AND lower(a.email_normalized) NOT LIKE '%.demo'
  AND o.lifecycle_status='active' AND o.id<>${LOCAL_DEMO_ADMIN.organizationId}::uuid
  AND NOT EXISTS(SELECT 1 FROM public.demo_school_tenants d WHERE d.organization_id=o.id)`;
async function requireEligibleRecipient(tx:Tx,id:string){
  const result=await tx.execute(sql`
    SELECT g.id FROM public.organizations o
    JOIN public.account_person_grants g ON g.organization_id=o.id
    JOIN public.access_accounts a ON a.id=g.account_id
    JOIN public.people p ON p.id=g.person_id
    WHERE o.id=${id}::uuid AND ${recipientEligible}
    ORDER BY g.id LIMIT 1 FOR SHARE OF g,a,p,o`);
  if(!result.rows.length)throw new AuthorizationError("registered eligible relationship recipient");
}

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
    const ownerId=await requireDirectRelationshipManager(tx,actor);
    const scope=await resolveScope(tx,candidate.scopeKind,candidate.scopeId,ownerId);
    await requireEligibleRecipient(tx,candidate.recipientOrganizationId);
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
    await requireDirectRelationshipManager(tx,actor);
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

/** Direct organization inbox: no inherited or delegated visibility. Bounded
 * keyset pagination; site-scoped grants must use a future exact-resource reader.
 * Internal only until independently ratified capability mapping is enabled. */
export async function listIncomingReportingRelationships(request:Request,input:unknown):Promise<ReportingRelationship[]>{
  const actor=await getIdentityContext(request);
  const organizationId=actor.scope.organizationIds?.length===1?actor.scope.organizationIds[0]:undefined;
  if(!organizationId)throw new AuthorizationError("relationship recipient scope");
  assertRelationshipActor(actor,organizationId,"relationships.decide");
  const {after}=z.object({after:uuid.optional()}).strict().parse(input);
  const result=await db.execute(sql`
    SELECT ${columns} FROM public.reporting_relationship_agreements
    WHERE recipient_organization_id=${organizationId}::uuid
      AND (${after??null}::uuid IS NULL OR id>${after??null}::uuid)
    ORDER BY id LIMIT 51`);
  return result.rows.map(row=>rowSchema.parse(row));
}

const lookupInput=z.object({query:z.string().trim().min(2).max(80),after:z.string().uuid().optional()}).strict();
/** Bounded opt-in discovery. Only organizations with a current independent
 * management appointment are requestable; never expose contacts or accounts. */
export async function searchRelationshipRecipients(request:Request,input:unknown){
  const actor=await getIdentityContext(request);
  const {query,after}=lookupInput.parse(input);
  return db.transaction(async tx=>{
    const ownerId=await requireDirectRelationshipManager(tx,actor);
    const result=await tx.execute(sql`
      SELECT DISTINCT o.id,o.name FROM public.organizations o
      JOIN public.account_person_grants g ON g.organization_id=o.id
      JOIN public.access_accounts a ON a.id=g.account_id
      JOIN public.people p ON p.id=g.person_id
      WHERE o.id<>${ownerId}::uuid AND ${recipientEligible}
        AND strpos(lower(o.name),lower(${query}))>0
        AND (${after??null}::uuid IS NULL OR o.id>${after??null}::uuid)
      ORDER BY o.id LIMIT 26`);
    const rows=z.array(z.object({id:uuid,name:z.string()})).parse(result.rows);
    return {items:rows.slice(0,25),next:rows.length>25?rows[24]!.id:null};
  });
}
const listInput=z.object({direction:z.enum(["incoming","outgoing"]),after:uuid.optional()}).strict();
/** Agreement metadata only; no outcome counts, underlying facts, actor IDs or
 * access to the other party's private workspace. */
export async function listReportingRelationships(request:Request,input:unknown){
  const actor=await getIdentityContext(request);
  const {direction,after}=listInput.parse(input);
  return db.transaction(async tx=>{
    const organizationId=await requireDirectRelationshipManager(tx,actor);
    const party=direction==="incoming"?sql`recipient_organization_id`:sql`owner_organization_id`;
    const result=await tx.execute(sql`
      SELECT ${columns} FROM public.reporting_relationship_agreements
      WHERE ${party}=${organizationId}::uuid
      AND (${after??null}::uuid IS NULL OR id>${after??null}::uuid)
      ORDER BY id LIMIT 26`);
    const rows=z.array(rowSchema).parse(result.rows);
    const items=rows.slice(0,25).map(({proposedByPersonId,acceptedByPersonId,...agreement})=>{
      const selfProposed=proposedByPersonId===actor.actorPersonId;
      const expired=agreement.validThrough!==null&&Date.parse(agreement.validThrough)<=Date.now();
      const allowedActions:RelationshipAction[]=agreement.status==="pending"?
        direction==="outgoing"?["withdraw"]:selfProposed||expired?[]:["accept","decline"]:
        agreement.status==="accepted"?["revoke"]:[];
      void acceptedByPersonId;
      return {agreement,allowedActions};
    });
    return {items,next:rows.length>25?rows[24]!.id:null};
  });
}

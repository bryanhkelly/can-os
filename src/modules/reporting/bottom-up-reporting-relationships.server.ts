import {parseCommandInput} from "@/domain/command-input";
import {sql} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import type {AccessContext} from "@/domain/access-context";
import {isDemoAccountEmail,isEligiblePrivilegedMailbox} from "@/domain/domain-classification";
import {canConnectRelationshipPopulations,relationshipIdentityEligible,relationshipPopulation} from "@/domain/reporting-relationship-population";
import {assertCurrentCANGrantForMutation} from "@/modules/identity/current-can-grant-transaction.server";
import {getIdentityContext} from "@/modules/identity/command-context.server";
import {AuthorizationError} from "@/domain/command-context";
import {relationshipProposalMetrics} from "@/domain/relationship-metric-policy";
import {readRelationshipRegistrationFacts,countRelationshipRegistrationCandidates} from "./relationship-registration-sources.server";
import {projectRelationshipRegistrationMetric} from "@/domain/relationship-registration-projection";
import {fingerprintRelationshipRegistrationCalculation} from "./relationship-report-manifest.server";
import {reconcileRegistrationSource} from "@/domain/relationship-source-reconciliation";
import {readAuthorizedOwnerDomains} from "@/modules/insights/reporting-population.server";
import {buildCurrentReportingMetricRegistry} from "@/domain/reporting-metric-registry";
import {
  assertRelationshipActor,relationshipProposalSchema,transitionRelationship,validateRelationshipProposal,
  type RelationshipAction,type RelationshipProposal,
  type ReportingRelationship,type VerifiedRelationshipScope,
} from "@/domain/bottom-up-reporting-relationships";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const uuid=z.string().uuid();
const iso=z.coerce.date().transform(value=>value.toISOString());
const rowSchema=relationshipProposalSchema.extend({
  id:uuid,dataPopulation:z.enum(["real","synthetic","unknown"]),ownerOrganizationId:uuid,proposedByPersonId:uuid,proposedAt:iso,
  validThrough:iso.nullable(),coverageFrom:iso.nullable(),
  status:z.enum(["pending","accepted","declined","withdrawn","revoked"]),
  acceptedAt:iso.nullable(),acceptedByPersonId:uuid.nullable(),
});
const columns=sql`id,data_population AS "dataPopulation",owner_organization_id AS "ownerOrganizationId",
  recipient_organization_id AS "recipientOrganizationId",scope_kind AS "scopeKind",
  scope_id AS "scopeId",relationship_kind AS "relationshipKind",metrics,
  coverage_mode AS "coverageMode",coverage_from AS "coverageFrom",supersedes_id AS "supersedesId",
  valid_through AS "validThrough",proposed_at AS "proposedAt",
  proposed_by_person_id AS "proposedByPersonId",status,
  accepted_at AS "acceptedAt",accepted_by_person_id AS "acceptedByPersonId"`;

/** Only a direct, independently provisioned organization-wide membership can
 * authorize initial relationship management. No automatic administrator grants.
 * Recheck and lock the live identity rows inside every command transaction. */
async function requireRelationshipAuthority(tx:Tx,request:Request,actor:AccessContext,allowInitiation=false):Promise<string>{
  const manager=actor.role==="reporting_relationship_manager"&&actor.grantSiteId===null;
  const initiator=allowInitiation&&actor.capabilities.has("relationships.initiate")&&actor.grantSiteId!==null;
  const organizationId=actor.scope.organizationIds?.[0];
  if(!organizationId||actor.scope.organizationIds?.length!==1||
    (!manager&&!initiator)||
    actor.sessionAccountId||actor.impersonatedByAccountId||actor.delegatedByPlatformOwner||!actor.actorPersonId)
    throw new AuthorizationError("direct organization reporting relationship manager");
  await assertCurrentCANGrantForMutation(tx,request,actor,{
    roles:manager?["reporting_relationship_manager"]:["site_admin","registrar"],
    organizationId,siteId:actor.grantSiteId,
  });
  // The shared identity guard locks the current session and grant. The
  // relationship policy adds only the owning institution's population check.
  const result=await tx.execute(sql`
    SELECT o.domain,a.email_normalized AS email,(a.email_verified_at IS NOT NULL) AS "mailboxVerified",
      s.authentication_method AS "authenticationMethod"
    FROM public.organizations o
    JOIN public.access_accounts a ON a.id=${actor.accountId}::uuid
    JOIN public.access_sessions s ON s.id=${actor.sessionId}::uuid AND s.account_id=a.id
    WHERE o.id=${organizationId}::uuid AND o.lifecycle_status='active'
    FOR SHARE OF o`);
  const membership=z.object({domain:z.string().nullable(),email:z.string(),mailboxVerified:z.boolean(),
    authenticationMethod:z.enum(["email_link","local_demo_code","private_access_code"]).nullable()}).safeParse(result.rows[0]);
  if(result.rows.length!==1||!membership.success||
    !relationshipIdentityEligible({...membership.data,organizationDomain:membership.data.domain}))
    throw new AuthorizationError("current verified reporting relationship membership");
  return organizationId;
}
const recipientEligible=sql`g.role='reporting_relationship_manager' AND g.active
  AND g.site_id IS NULL AND a.person_id=g.person_id AND NOT a.disabled AND p.active
  AND o.lifecycle_status='active'`;
const recipientIdentity=z.object({id:uuid,domain:z.string().nullable(),email:z.string(),mailboxVerified:z.boolean()});
function eligibleRecipientIdentity(row:z.infer<typeof recipientIdentity>):boolean{
  const population=relationshipPopulation(row.domain);
  return population==="real"?row.mailboxVerified&&isEligiblePrivilegedMailbox(row.email):
    population==="synthetic"&&isDemoAccountEmail(row.email);
}
async function ownerDomain(tx:Tx,id:string):Promise<string|null>{
  const result=await tx.execute(sql`SELECT domain FROM public.organizations WHERE id=${id}::uuid FOR SHARE`);
  if(!result.rows.length)throw new AuthorizationError("current relationship organization");
  return z.object({domain:z.string().nullable()}).parse(result.rows[0]).domain;
}
async function requireEligibleRecipient(tx:Tx,ownerId:string,id:string){
  const domain=await ownerDomain(tx,ownerId);
  const result=await tx.execute(sql`
    SELECT o.id,o.domain,a.email_normalized AS email,(a.email_verified_at IS NOT NULL) AS "mailboxVerified"
    FROM public.organizations o
    JOIN public.account_person_grants g ON g.organization_id=o.id
    JOIN public.access_accounts a ON a.id=g.account_id
    JOIN public.people p ON p.id=g.person_id
    WHERE o.id=${id}::uuid AND ${recipientEligible}
    ORDER BY g.id LIMIT 101 FOR SHARE OF g,a,p,o`);
  const rows=z.array(recipientIdentity).parse(result.rows);
  if(!rows.some(row=>canConnectRelationshipPopulations(domain,row.domain)&&eligibleRecipientIdentity(row)))
    throw new AuthorizationError("registered eligible same-population relationship recipient");
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

/** Proposal terms use a server-owned allowlist; accepting terms does not release numbers. */
export async function proposeReportingRelationship(request:Request,input:unknown):Promise<ReportingRelationship>{
  const actor=await getIdentityContext(request);
  const canAuthorize=actor.capabilities.has("relationships.propose");
  if((!canAuthorize&&!actor.capabilities.has("relationships.initiate"))||actor.scope.organizationIds?.length!==1)
    throw new AuthorizationError("relationship initiation");
  const candidate=parseCommandInput(relationshipProposalSchema,input);
  return db.transaction(async tx=>{
    const ownerId=await requireRelationshipAuthority(tx,request,actor,true);
    const scope=await resolveScope(tx,candidate.scopeKind,candidate.scopeId,ownerId);
    if(!canAuthorize&&(candidate.metrics.length>0||candidate.supersedesId||candidate.coverageFrom||
      (candidate.coverageMode&&candidate.coverageMode!=="prospective")||!scope.siteId))
      throw new AuthorizationError("Site initiation can propose a tag only; reporting requires independent owner authorization");
    await requireEligibleRecipient(tx,ownerId,candidate.recipientOrganizationId);
    const person=assertRelationshipActor(actor,scope.ownerOrganizationId,canAuthorize?"relationships.propose":"relationships.initiate",scope.siteId);
    const population=relationshipPopulation(await ownerDomain(tx,ownerId));
    if(!population)throw new AuthorizationError("classified relationship owner");
    const proposal=validateRelationshipProposal(candidate,scope,buildCurrentReportingMetricRegistry(),relationshipProposalMetrics(candidate.scopeKind),new Date());
    const result=await tx.execute(sql`
      INSERT INTO public.reporting_relationship_agreements
        (owner_organization_id,recipient_organization_id,scope_kind,site_id,program_id,offering_id,class_id,
         relationship_kind,metrics,data_population,valid_through,coverage_mode,coverage_from,supersedes_id,proposed_by_person_id,last_action_by_person_id,last_action_organization_id)
      VALUES (${scope.ownerOrganizationId}::uuid,${proposal.recipientOrganizationId}::uuid,${proposal.scopeKind},
        ${proposal.scopeKind==="site"?proposal.scopeId:null}::uuid,
        ${proposal.scopeKind==="program"?proposal.scopeId:null}::uuid,
        ${proposal.scopeKind==="offering"?proposal.scopeId:null}::uuid,
        ${proposal.scopeKind==="class"?proposal.scopeId:null}::uuid,
        ${proposal.relationshipKind},${JSON.stringify(proposal.metrics)}::jsonb,${population},${proposal.validThrough}::timestamptz,
        ${proposal.coverageMode??"prospective"},${proposal.coverageFrom??null}::timestamptz,${proposal.supersedesId??null}::uuid,
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
  const {agreementId,action}=parseCommandInput(actionInput,input);
  const capability=action==="accept"||action==="decline"?"relationships.decide":"relationships.revoke";
  if(!actor.capabilities.has(capability)||actor.scope.organizationIds?.length!==1)
    throw new AuthorizationError(capability);
  const organizationId=actor.scope.organizationIds[0]!;
  return db.transaction(async tx=>{
    await requireRelationshipAuthority(tx,request,actor);
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
    if(action==="accept"){
      if(current.dataPopulation!==relationshipPopulation(await ownerDomain(tx,current.ownerOrganizationId))||
        current.dataPopulation!==relationshipPopulation(await ownerDomain(tx,current.recipientOrganizationId)))
        throw new AuthorizationError("unchanged relationship population");
      await requireEligibleRecipient(tx,current.ownerOrganizationId,current.recipientOrganizationId);
      await requireEligibleRecipient(tx,current.recipientOrganizationId,current.ownerOrganizationId);
      const {recipientOrganizationId,scopeKind,scopeId,relationshipKind,metrics,validThrough,coverageMode,coverageFrom,supersedesId}=current;
      validateRelationshipProposal({recipientOrganizationId,scopeKind,scopeId,relationshipKind,metrics,validThrough,coverageMode,coverageFrom,supersedesId},
        scope,buildCurrentReportingMetricRegistry(),relationshipProposalMetrics(scopeKind),new Date());
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

const lookupInput=z.object({query:z.string().trim().min(2).max(80),after:z.string().uuid().optional()}).strict();
/** Bounded opt-in discovery. Only organizations with a current independent
 * management appointment are requestable; never expose contacts or accounts. */
export async function searchRelationshipRecipients(request:Request,input:unknown){
  const actor=await getIdentityContext(request);
  const {query,after}=parseCommandInput(lookupInput,input);
  return db.transaction(async tx=>{
    const ownerId=await requireRelationshipAuthority(tx,request,actor,true);
    const domain=await ownerDomain(tx,ownerId);
    // Page the candidate organizations, not their memberships. The cursor is
    // based on the scanned page even if every candidate fails eligibility.
    const result=await tx.execute(sql`
      SELECT o.id,o.name,o.domain FROM public.organizations o
      WHERE o.id<>${ownerId}::uuid AND o.lifecycle_status='active'
        AND strpos(lower(o.name),lower(${query}))>0
        AND (${after??null}::uuid IS NULL OR o.id>${after??null}::uuid)
        AND EXISTS(SELECT 1 FROM public.account_person_grants g
          WHERE g.organization_id=o.id AND g.role='reporting_relationship_manager' AND g.active AND g.site_id IS NULL)
      ORDER BY o.id LIMIT 26`);
    const rows=z.array(z.object({id:uuid,name:z.string(),domain:z.string().nullable()})).parse(result.rows);
    const items:{id:string;name:string}[]=[];
    for(const row of rows.slice(0,25)){
      if(!canConnectRelationshipPopulations(domain,row.domain))continue;
      try{await requireEligibleRecipient(tx,ownerId,row.id);}
      catch(error){if(error instanceof AuthorizationError)continue;throw error;}
      items.push({id:row.id,name:row.name});
    }
    return {items,next:rows.length>25?rows[24]!.id:null};
  });
}
const listInput=z.object({direction:z.enum(["incoming","outgoing"]),after:uuid.optional(),
  scope:relationshipProposalSchema.pick({scopeKind:true,scopeId:true}).optional()}).strict();
/** Agreement metadata only; no outcome counts, underlying facts, actor IDs or
 * access to the other party's private workspace. */
export async function listReportingRelationships(request:Request,input:unknown){
  const actor=await getIdentityContext(request);
  const {direction,after,scope:selection}=parseCommandInput(listInput,input);
  return db.transaction(async tx=>{
    const manager=actor.capabilities.has("relationships.propose");
    if(!manager&&(!selection||direction!=="outgoing"))throw new AuthorizationError("exact Site relationship scope");
    const organizationId=await requireRelationshipAuthority(tx,request,actor,!!selection&&direction==="outgoing");
    const scope=selection?await resolveScope(tx,selection.scopeKind,selection.scopeId,organizationId):null;
    if(scope){
      if(direction!=="outgoing")throw new AuthorizationError("outgoing relationship resource");
      assertRelationshipActor(actor,scope.ownerOrganizationId,manager?"relationships.propose":"relationships.initiate",scope.siteId);
    }
    const scopeFilter=scope?sql`AND ((scope_kind=${scope.scopeKind} AND scope_id=${scope.scopeId}::uuid)
      OR (status='accepted' AND (valid_through IS NULL OR valid_through>CURRENT_TIMESTAMP) AND scope_kind='organization' AND scope_id=${organizationId}::uuid)
      OR (status='accepted' AND (valid_through IS NULL OR valid_through>CURRENT_TIMESTAMP) AND scope_kind='site' AND scope_id=${scope.siteId}::uuid))`:sql``;
    const party=direction==="incoming"?sql`recipient_organization_id`:sql`owner_organization_id`;
    const result=await tx.execute(sql`
      SELECT r.*,
        (SELECT name FROM public.organizations WHERE id=CASE WHEN ${direction}='incoming'
          THEN r."ownerOrganizationId" ELSE r."recipientOrganizationId" END) AS "organizationName",
        CASE r."scopeKind"
          WHEN 'organization' THEN (SELECT name FROM public.organizations WHERE id=r."scopeId")
          WHEN 'site' THEN (SELECT name FROM public.sites WHERE id=r."scopeId")
          WHEN 'program' THEN (SELECT name FROM public.programs WHERE id=r."scopeId")
          WHEN 'offering' THEN (SELECT title FROM public.offerings WHERE id=r."scopeId")
          WHEN 'class' THEN (SELECT title FROM public.classes WHERE id=r."scopeId")
        END AS "scopeName"
      FROM (SELECT ${columns} FROM public.reporting_relationship_agreements
        WHERE ${party}=${organizationId}::uuid ${scopeFilter}
        AND (${after??null}::uuid IS NULL OR id>${after??null}::uuid)
        ORDER BY id LIMIT 26) r ORDER BY r.id`);
    const rows=z.array(rowSchema.extend({organizationName:z.string(),scopeName:z.string()})).parse(result.rows);
    const registry=buildCurrentReportingMetricRegistry();
    const items=rows.slice(0,25).map(({proposedByPersonId,acceptedByPersonId,organizationName,scopeName,...agreement})=>{
      const selfProposed=proposedByPersonId===actor.actorPersonId;
      const expired=agreement.validThrough!==null&&Date.parse(agreement.validThrough)<=Date.now();
      const inherited=!!scope&&(agreement.scopeKind!==scope.scopeKind||agreement.scopeId!==scope.scopeId);
      const allowedActions:RelationshipAction[]=!manager||inherited?[]:agreement.status==="pending"?
        direction==="outgoing"?["withdraw"]:selfProposed||expired?[]:["accept","decline"]:
        agreement.status==="accepted"?["revoke"]:[];
      void acceptedByPersonId;
      const metricLabels=agreement.metrics.map(m=>{
        const definition=registry.find(d=>d.metricKey===m.metricKey&&d.definitionVersion===m.definitionVersion);
        return (definition?.label??m.metricKey)+" ("+m.metricKey+", v"+m.definitionVersion+")";
      });
      return {agreement,allowedActions,organizationName,scopeName,metricLabels,inherited};
    });
    return {items,next:rows.length>25?rows[24]!.id:null,canAuthorize:manager,metrics:manager&&scope?relationshipProposalMetrics(scope.scopeKind):[]};
  });
}

const scopeInput=z.object({kind:relationshipProposalSchema.shape.scopeKind,after:uuid.optional()}).strict();
/** Resource choices are independently resolved from the current owner's data. */
export async function listRelationshipScopes(request:Request,input:unknown){
  const actor=await getIdentityContext(request);
  const {kind,after}=parseCommandInput(scopeInput,input);
  return db.transaction(async tx=>{
    const owner=await requireRelationshipAuthority(tx,request,actor);
    const source=kind==="organization"?sql`SELECT id,name FROM public.organizations WHERE id=${owner}::uuid`:
      kind==="site"?sql`SELECT id,name FROM public.sites WHERE organization_id=${owner}::uuid`:
      kind==="program"?sql`SELECT id,name FROM public.programs WHERE organization_id=${owner}::uuid`:
      kind==="offering"?sql`SELECT id,title AS name FROM public.offerings WHERE public.reporting_relationship_offering_owner(id,${owner}::uuid)`:
      sql`SELECT id,title AS name FROM public.classes WHERE operating_organization_id=${owner}::uuid`;
    const result=await tx.execute(sql`
      SELECT id,name FROM (${source}) scope
      WHERE (${after??null}::uuid IS NULL OR id>${after??null}::uuid)
      ORDER BY id LIMIT 26`);
    const rows=z.array(z.object({id:uuid,name:z.string()})).parse(result.rows);
    return {items:rows.slice(0,25),next:rows.length>25?rows[24]!.id:null,metrics:relationshipProposalMetrics(kind)};
  });
}

/** Setup inventory only. The counts describe current relationship terms, not
 * executable reporting authority or learner outcomes. Never total a paged inbox. */
export async function readRelationshipPortfolio(request:Request){
  const actor=await getIdentityContext(request);
  return db.transaction(async tx=>{
    const organizationId=await requireRelationshipAuthority(tx,request,actor);
    const population=relationshipPopulation(await ownerDomain(tx,organizationId));
    if(!population)throw new AuthorizationError("classified relationship portfolio");
    const result=await tx.execute(sql`
      SELECT r.id,r.owner_organization_id AS "ownerId",r.recipient_organization_id AS "recipientId",
        r.scope_kind AS "scopeKind",r.scope_id AS "scopeId",r.relationship_kind AS "kind",r.status,
        r.data_population AS population,jsonb_array_length(r.metrics)::integer AS "metricCount",
        owner.domain AS "ownerDomain",recipient.domain AS "recipientDomain"
      FROM public.reporting_relationship_agreements r
      JOIN public.organizations owner ON owner.id=r.owner_organization_id AND owner.lifecycle_status='active'
      JOIN public.organizations recipient ON recipient.id=r.recipient_organization_id AND recipient.lifecycle_status='active'
      WHERE (r.owner_organization_id=${organizationId}::uuid OR r.recipient_organization_id=${organizationId}::uuid)
        AND r.status IN ('accepted','pending')
        AND (r.valid_through IS NULL OR r.valid_through>CURRENT_TIMESTAMP)
      ORDER BY r.id LIMIT 10001`);
    const rows=z.array(z.object({id:uuid,ownerId:uuid,recipientId:uuid,
      scopeKind:relationshipProposalSchema.shape.scopeKind,scopeId:uuid,
      kind:relationshipProposalSchema.shape.relationshipKind,status:z.enum(["accepted","pending"]),
      population:z.enum(["real","synthetic","unknown"]),metricCount:z.number().int().nonnegative(),
      ownerDomain:z.string().nullable(),recipientDomain:z.string().nullable()})).parse(result.rows);
    if(rows.length>10000)throw new Error("Relationship portfolio exceeds bounded inventory; use a scoped report.");
    const current=rows.filter(row=>row.population===population&&
      relationshipPopulation(row.ownerDomain)===population&&relationshipPopulation(row.recipientDomain)===population);
    const accepted=current.filter(row=>row.status==="accepted");
    const connectedOrganizations=new Set(accepted.map(row=>row.ownerId===organizationId?row.recipientId:row.ownerId)).size;
    const byKind=Object.entries(accepted.reduce<Record<string,number>>((counts,row)=>{
      counts[row.kind]=(counts[row.kind]??0)+1;return counts;
    },{})).sort(([a],[b])=>a.localeCompare(b)).map(([kind,count])=>({kind,count}));
    return {population,asOf:new Date().toISOString(),connectedOrganizations,
      acceptedRelationships:accepted.length,acceptedWithReportingTerms:accepted.filter(row=>row.metricCount>0).length,
      awaitingOurResponse:current.filter(row=>row.status==="pending"&&row.recipientId===organizationId).length,
      awaitingPartnerResponse:current.filter(row=>row.status==="pending"&&row.ownerId===organizationId).length,
      taggedPrograms:new Set(accepted.filter(row=>row.scopeKind==="program"&&row.ownerId===organizationId).map(row=>row.scopeId)).size,
      excludedUnclassifiedOrChanged:rows.length-current.length,byKind};
  });
}

const internalReportInput=z.object({
  metric:z.object({metricKey:z.enum(["class.registrations","class.uniquePeople","noncredit.registrations","noncredit.distinctLearners"]),definitionVersion:z.string().min(1).max(64)}).strict(),
  from:z.string().datetime({offset:true}),to:z.string().datetime({offset:true}),
}).strict();
/** Internal projection only. Do not export a server function until approved
 * disclosure artifacts, source completeness reconciliation and independent
 * review of overlapping cuts are available. Never return source facts. */
export async function readInternalRelationshipRegistrationProjection(request:Request,input:unknown){
  const actor=await getIdentityContext(request);
  const {metric,from,to}=parseCommandInput(internalReportInput,input);
  if(!actor.capabilities.has("relationships.report"))throw new AuthorizationError("relationships.report");
  return db.transaction(async tx=>{
    const recipient=await requireRelationshipAuthority(tx,request,actor);
    const now=new Date(),start=Date.parse(from),end=Date.parse(to);
    if(!(start<end&&end<=now.getTime()&&end-start<=366*86400000))
      throw Error("Choose a valid closed reporting window of up to 366 days.");
    const population=relationshipPopulation(await ownerDomain(tx,recipient));
    if(!population)throw new AuthorizationError("classified report recipient");
    if(!relationshipProposalMetrics("organization").some(m=>m.metricKey===metric.metricKey&&m.definitionVersion===metric.definitionVersion))
      throw Error("Current metric definition is unavailable");
    const result=await tx.execute(sql`
      SELECT ${columns} FROM public.reporting_relationship_agreements
      WHERE recipient_organization_id=${recipient}::uuid AND status='accepted'
        AND accepted_at<=CURRENT_TIMESTAMP AND (valid_through IS NULL OR valid_through>CURRENT_TIMESTAMP)
        AND data_population=${population} AND metrics @> ${JSON.stringify([metric])}::jsonb
      ORDER BY id LIMIT 10001`);
    const agreements=z.array(rowSchema).parse(result.rows);
    if(agreements.length>10000)throw Error("Too many relationships for this report window");
    const candidateOwners=[...new Set(agreements.map(a=>a.ownerOrganizationId))];
    const ownerDomains=await readAuthorizedOwnerDomains(tx,candidateOwners);
    const live:ReportingRelationship[]=[];
    for(const a of agreements){
      if(relationshipPopulation(ownerDomains.get(a.ownerOrganizationId)??null)!==population)continue;
      const owner=await tx.execute(sql`SELECT id FROM public.organizations WHERE id=${a.ownerOrganizationId}::uuid AND lifecycle_status='active' FOR SHARE`);
      if(!owner.rows.length)continue;
      try{
        const scope=await resolveScope(tx,a.scopeKind,a.scopeId,a.ownerOrganizationId);
        if(scope.ownerOrganizationId!==a.ownerOrganizationId)continue;
      }catch(error){if(error instanceof AuthorizationError)continue;throw error;}
      // No canonical Class/registration -> local Program mapping is established
      // by these adapters. Never treat Program consent as a Site-wide grant.
      if(a.scopeKind==="program")continue;
      live.push(a);
    }
    const owners=[...new Set(live.map(a=>a.ownerOrganizationId))];
    const selection={source:metric.metricKey.startsWith("class.")?"native_class_enrollment" as const:"noncredit_registration" as const,ownerIds:owners,from,to};
    const candidates=await countRelationshipRegistrationCandidates(tx,selection);
    const facts=await readRelationshipRegistrationFacts(tx,selection);
    const sourceJoin=reconcileRegistrationSource(candidates,facts.length);
    const projection=projectRelationshipRegistrationMetric(actor,recipient,metric,live,facts,{
      recipientOrganizationId:recipient,currentAgreementIds:new Set(live.map(a=>a.id)),
      sourceProof:{verifiedOrganizationIds:new Set(owners),verifiedSiteIds:new Set(facts.map(f=>f.deliverySiteId))},
      population:{classification:population,ownerDomains},
    },{from,to,asOf:now.toISOString()},now);
    const calculationFingerprint=fingerprintRelationshipRegistrationCalculation({recipientOrganizationId:recipient,population,metric,window:{from,to,asOf:now.toISOString()},agreements:live,facts,sourceJoin,projection});
    return {projection,calculationFingerprint,disclosureApproved:false as const,coverage:{
      siteBackedOnly:true,noncreditSelfEnrollmentClaimsOnly:true,programMappingAvailable:false,
      sourceJoin,sourceCompletenessVerified:false,
    }};
  },{isolationLevel:"repeatable read"});
}

import { z } from "zod";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import { requireMetricContract, type SourceMetricContract } from "@/domain/reporting-metric-registry";
import type { ReportingDimensions } from "@/domain/reporting-source-contract";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({offset:true});
export const relationshipScopeKinds = ["organization","site","program","offering","class"] as const;
export const relationshipKinds = ["affiliation","sponsorship","funding","provider","host","accreditation","endorsement","operator","partnership"] as const;
export const relationshipMetricSchema = z.object({
  metricKey:z.string().min(1).max(128),
  definitionVersion:z.string().min(1).max(64),
}).strict();
export const relationshipProposalSchema = z.object({
  recipientOrganizationId:uuid,
  scopeKind:z.enum(relationshipScopeKinds),
  scopeId:uuid,
  relationshipKind:z.enum(relationshipKinds),
  metrics:z.array(relationshipMetricSchema).max(50),
  coverageMode:z.enum(["prospective","from_date","all_history"]).optional(),
  coverageFrom:timestamp.nullable().optional(),
  supersedesId:uuid.nullable().optional(),
  validThrough:timestamp.nullable(),
}).strict();
export type RelationshipProposal = z.infer<typeof relationshipProposalSchema>;
export type RelationshipMetric = z.infer<typeof relationshipMetricSchema>;
export type ReportingRelationship = RelationshipProposal & {
  id:string;
  ownerOrganizationId:string;
  proposedByPersonId:string;
  proposedAt:string;
  status:"pending"|"accepted"|"declined"|"withdrawn"|"revoked";
  acceptedAt:string|null;
  acceptedByPersonId:string|null;
};
export type RelationshipAction = "accept"|"decline"|"withdraw"|"revoke";
export type VerifiedRelationshipActor = CommandContext & {
  grantSiteId:string|null;
  delegatedByPlatformOwner?:true;
};
export type VerifiedRelationshipScope = {
  scopeKind:RelationshipProposal["scopeKind"];
  scopeId:string;
  ownerOrganizationId:string;
  siteId:string|null;
};

export function validateRelationshipProposal(input:unknown,owner:VerifiedRelationshipScope,
  registry:readonly SourceMetricContract[],approvedMetrics:readonly RelationshipMetric[],now:Date) {
  const proposal=relationshipProposalSchema.parse(input);
  if(proposal.scopeKind!==owner.scopeKind||proposal.scopeId!==owner.scopeId||
    proposal.recipientOrganizationId===owner.ownerOrganizationId||
    !Number.isFinite(now.getTime())||
    (proposal.validThrough!==null&&Date.parse(proposal.validThrough)<=now.getTime()))
    throw new Error("Invalid relationship scope or effective period");
  const coverage=proposal.coverageMode??"prospective";
  if(coverage==="from_date"?(!proposal.coverageFrom||Date.parse(proposal.coverageFrom)>now.getTime()):proposal.coverageFrom!=null)
    throw new Error("Explicit valid reporting coverage required");
  const keys=new Set<string>();
  for(const metric of proposal.metrics){
    requireMetricContract(registry,metric.metricKey,metric.definitionVersion);
    if(keys.has(metric.metricKey)||!approvedMetrics.some(m=>m.metricKey===metric.metricKey&&
      m.definitionVersion===metric.definitionVersion))
      throw new Error("Duplicate or unapproved relationship metric");
    keys.add(metric.metricKey);
  }
  return proposal;
}

/** Only a trusted service may construct the verified scope, actor and metric policy.
 * A Site grant may propose for its own Site/Program/Class, not for an organization
 * or a publisher-wide Offering. New disclosure capabilities must be ratified
 * separately from ordinary administration and insights access. */
export function assertRelationshipActor(actor:VerifiedRelationshipActor,organizationId:string,
  capability:"relationships.propose"|"relationships.decide"|"relationships.revoke"|"relationships.report",
  siteId:string|null=null):string {
  if(!actor.actorPersonId||actor.sessionAccountId||actor.impersonatedByAccountId||
    actor.delegatedByPlatformOwner||!actor.capabilities.has(capability)||
    actor.scope.organizationIds?.length!==1||actor.scope.organizationIds[0]!==organizationId||
    (actor.grantSiteId!==null&&(siteId===null||actor.grantSiteId!==siteId)))
    throw new AuthorizationError("direct scoped reporting relationship authority");
  return actor.actorPersonId;
}

/** Immutable proposed terms. Declines/withdrawals/revocations are terminal;
 * a changed scope or metric set must be a new independently accepted proposal. */
export function transitionRelationship(relationship:ReportingRelationship,action:RelationshipAction,
  actor:VerifiedRelationshipActor,now:Date,owner:VerifiedRelationshipScope):ReportingRelationship {
  const time=now.getTime();
  if(!Number.isFinite(time)||time<Date.parse(relationship.proposedAt)||
    owner.ownerOrganizationId!==relationship.ownerOrganizationId||
    owner.scopeKind!==relationship.scopeKind||owner.scopeId!==relationship.scopeId)
    throw new Error("Invalid relationship transition context");
  const deciding=action==="accept"||action==="decline";
  if(deciding){
    const person=assertRelationshipActor(actor,relationship.recipientOrganizationId,"relationships.decide");
    if(person===relationship.proposedByPersonId||relationship.status!=="pending"||
      (relationship.validThrough!==null&&Date.parse(relationship.validThrough)<=time))
      throw new Error("Independent current pending relationship required");
    return {...relationship,status:action==="accept"?"accepted":"declined",
      acceptedAt:action==="accept"?now.toISOString():null,
      acceptedByPersonId:action==="accept"?person:null};
  }
  const actorOrg=actor.scope.organizationIds?.[0];
  if(actorOrg===relationship.recipientOrganizationId&&action==="revoke"){
    assertRelationshipActor(actor,relationship.recipientOrganizationId,"relationships.revoke");
  }else{
    assertRelationshipActor(actor,relationship.ownerOrganizationId,"relationships.revoke",owner.siteId);
  }
  if((action==="withdraw"&&relationship.status!=="pending")||
    (action==="revoke"&&relationship.status!=="accepted"))
    throw new Error("Relationship is not in a revocable state");
  return {...relationship,status:action==="withdraw"?"withdrawn":"revoked"};
}

export type RelationshipFact = {
  dimensions:ReportingDimensions;
  occurredAt:string;
};

/** Fact-grain matching, never a host-wide grant expansion. No transitive
 * traversal or recipient re-sharing. A publisher Offering does not authorize
 * records whose source Organization is an independent host. Missing dimensions
 * deny narrower scopes. Historical coverage is explicit and independently accepted. */
export function relationshipMatchesFact(relationship:ReportingRelationship,
  recipientOrganizationId:string,metric:RelationshipMetric,fact:RelationshipFact,now:Date):boolean {
  const current=now.getTime(),occurred=Date.parse(fact.occurredAt);
  const accepted=Date.parse(relationship.acceptedAt??"");
  const proposed=Date.parse(relationship.proposedAt);
  const expiry=relationship.validThrough===null?Infinity:Date.parse(relationship.validThrough);
  const coverage=relationship.coverageMode??"prospective";
  const start=coverage==="all_history"?-Infinity:coverage==="from_date"?Date.parse(relationship.coverageFrom??""):accepted;
  if(coverage==="from_date"?(!Number.isFinite(start)||start>proposed):relationship.coverageFrom!=null)return false;
  if(relationship.status!=="accepted"||!relationship.acceptedByPersonId||
    relationship.acceptedByPersonId===relationship.proposedByPersonId||
    !Number.isFinite(current)||!Number.isFinite(occurred)||!Number.isFinite(accepted)||
    !Number.isFinite(proposed)||accepted<proposed||accepted>current||!(occurred>=start)||
    occurred>current||!(expiry>current)||!(expiry>occurred)||
    relationship.recipientOrganizationId!==recipientOrganizationId||
    relationship.ownerOrganizationId!==fact.dimensions.organizationId||
    !relationship.metrics.some(m=>m.metricKey===metric.metricKey&&m.definitionVersion===metric.definitionVersion))
    return false;
  const d=fact.dimensions;
  switch(relationship.scopeKind){
    case "organization":return relationship.scopeId===d.organizationId;
    case "site":return relationship.scopeId===d.siteId;
    case "program":return relationship.scopeId===d.programId;
    case "offering":return relationship.scopeId===d.offeringId;
    case "class":return relationship.scopeId===d.classId;
    default:return false;
  }
}

/** Match all eligible direct agreements to a single already canonical fact.
 * A reporting projection consumes that fact once, irrespective of match count.
 * This is NOT permission to publish or export a private operational metric. */
export function matchingRelationshipIds(actor:VerifiedRelationshipActor,recipientOrganizationId:string,
  relationships:readonly ReportingRelationship[],metric:RelationshipMetric,fact:RelationshipFact,
  now:Date):string[]{
  assertRelationshipActor(actor,recipientOrganizationId,"relationships.report");
  return [...new Set(relationships.filter(r=>relationshipMatchesFact(r,recipientOrganizationId,metric,fact,now))
    .map(r=>r.id))].sort();
}

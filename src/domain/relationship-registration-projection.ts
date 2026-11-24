import {canonicalJson} from "@/lib/canonical-json";
import {rollupAuthorizedParticipation,type ParticipationReportingFact,type ReportingScopeProof} from "@/domain/participation-rollups";
import {assertRelationshipActor,relationshipMatchesFact,type ReportingRelationship,type VerifiedRelationshipActor,type RelationshipMetric} from "@/domain/bottom-up-reporting-relationships";
import {relationshipProposalMetrics} from "@/domain/relationship-metric-policy";

/** Trusted source adapters must establish actual attribution, NOT infer a
 * Program from its Site or use a publisher as the host. */
export type RelationshipRegistrationFact=ParticipationReportingFact&{
  offeringId:string|null;
  classId:string|null;
};
const supported={
  "class.registrations":{source:"native_class_enrollment",result:"registrations"},
  "class.uniquePeople":{source:"native_class_enrollment",result:"uniquePeople"},
  "noncredit.registrations":{source:"noncredit_registration",result:"registrations"},
  "noncredit.distinctLearners":{source:"noncredit_registration",result:"uniquePeople"},
} as const;
type RegistrationMetricKey=keyof typeof supported;
type ReportWindow={from:string;to:string;asOf:string};
type VerifiedProjectionAuthority={
  recipientOrganizationId:string;
  currentAgreementIds:ReadonlySet<string>;
  sourceProof:ReportingScopeProof;
};

/** INTERNAL calculation, not an external disclosure authorization or endpoint.
 * Trusted server readers must provide canonical source facts, current
 * ownership/eligibility proofs and independently verified live agreements.
 * An external release must separately review the exact report and audience.
 * Counts stay metric-specific: no summing native Class and noncredit reach. */
export function projectRelationshipRegistrationMetric(
  actor:VerifiedRelationshipActor,recipientOrganizationId:string,
  metric:RelationshipMetric,agreements:readonly ReportingRelationship[],
  facts:readonly RelationshipRegistrationFact[],authority:VerifiedProjectionAuthority,
  window:ReportWindow,now:Date,
){
  assertRelationshipActor(actor,recipientOrganizationId,"relationships.report");
  if(authority.recipientOrganizationId!==recipientOrganizationId||
    !Object.hasOwn(supported,metric.metricKey)||
    !relationshipProposalMetrics("organization").some(m=>m.metricKey===metric.metricKey&&m.definitionVersion===metric.definitionVersion))
    throw new Error("Unsupported or unauthorized registration projection");
  const from=Date.parse(window.from),to=Date.parse(window.to),asOf=Date.parse(window.asOf),current=now.getTime();
  if(![from,to,asOf,current].every(Number.isFinite)||from>=to||to>asOf||asOf>current||to-from>366*86400000)
    throw new Error("Invalid or unbounded relationship report period");
  if(facts.length>100_000||agreements.length>10_000)throw new Error("Relationship projection exceeds bounded source window");
  const definition=supported[metric.metricKey as RegistrationMetricKey];
  const live=agreements.filter(a=>authority.currentAgreementIds.has(a.id)&&
    a.recipientOrganizationId===recipientOrganizationId);
  const matched=new Map<string,{fact:RelationshipRegistrationFact;signature:string}>();
  const provenance=new Set<string>();
  for(const fact of facts){
    if(fact.source!==definition.source)continue;
    const occurred=Date.parse(fact.registeredAt);
    if(!Number.isFinite(occurred))throw new Error("Invalid registration occurrence");
    if(occurred<from||occurred>=to)continue;
    const dimensions={organizationId:fact.operatingOrganizationId,siteId:fact.deliverySiteId,
      programId:fact.programId,offeringId:fact.offeringId,classId:fact.classId};
    const eligible=live.filter(a=>relationshipMatchesFact(a,recipientOrganizationId,metric,{dimensions,occurredAt:fact.registeredAt},now));
    if(!eligible.length)continue;
    const key=fact.source+":"+fact.sourceId;
    const signature=canonicalJson(fact);
    const prior=matched.get(key);
    if(prior&&prior.signature!==signature)throw new Error("Conflicting canonical registration evidence");
    if(!prior)matched.set(key,{fact,signature});
    for(const a of eligible)provenance.add(a.id);
  }
  const included=[...matched.values()].map(value=>value.fact);
  if(!included.length)return {status:"no_authorized_evidence" as const,metric,value:null,distinctContributors:0,agreementIds:[] as string[]};
  const result=rollupAuthorizedParticipation(included,authority.sourceProof,window);
  return {status:"internal_projection" as const,metric,value:result.totals[definition.result],
    distinctContributors:result.totals.uniquePeople,agreementIds:[...provenance].sort()};
}

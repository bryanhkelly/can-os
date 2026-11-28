import {canonicalJson} from "@/lib/canonical-json";
import {assertPublishedReportDisclosure,type PublicationDisclosureApproval} from "./network-reporting-authorization";
import type {RelationshipMetric} from "./bottom-up-reporting-relationships";
import type {RelationshipPopulation} from "./reporting-relationship-population";

export const RELATIONSHIP_MINIMUM_DISTINCT_CONTRIBUTORS=10;
export type RelationshipDisclosureScope={
  recipientOrganizationId:string;population:RelationshipPopulation;
  metric:RelationshipMetric;from:string;to:string;asOf:string;
  agreementIds:readonly string[];manifestDigest:string;
};
/** Trusted server constructs this digest from the exact authorized scope and
 * reconciled source manifest; the client cannot supply either proof. */
export async function relationshipDisclosureDigest(scope:RelationshipDisclosureScope):Promise<string>{
  const from=Date.parse(scope.from),to=Date.parse(scope.to),asOf=Date.parse(scope.asOf);
  if(!scope.recipientOrganizationId||!scope.agreementIds.length||scope.agreementIds.some(id=>!id)||new Set(scope.agreementIds).size!==scope.agreementIds.length||!/^[a-f0-9]{64}$/.test(scope.manifestDigest)||!scope.metric.metricKey||!scope.metric.definitionVersion||!["real","synthetic"].includes(scope.population)||![from,to,asOf].every(Number.isFinite)||from>=to||to>asOf||to-from>366*86400000)
    throw Error("Exact relationship report scope and source manifest required");
  const payload=canonicalJson({...scope,agreementIds:[...new Set(scope.agreementIds)].sort()});
  const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");
}
/** An INTERNAL last-mile gate, not an authorization or report reader.
 * Exact current agreements, verified population, reconciled source coverage
 * and reviewed cross-cell/historical differencing must already be established.
 * An approval for an older manifest or agreement set cannot authorize this one.
 * Never expose unsuppressed projections, contributor identities or suppressed
 * contributor counts to a partner. */
export async function discloseRelationshipMetric(input:{
  scope:Scope;sourceCompletenessVerified:boolean;approval:PublicationDisclosureApproval|null;
  value:number;distinctContributors:number;currentAgreementIds:ReadonlySet<string>;
},now=new Date()){
  if(!Number.isFinite(now.getTime())||Date.parse(input.scope.asOf)>now.getTime()||!input.sourceCompletenessVerified||
    input.scope.agreementIds.some(id=>!input.currentAgreementIds.has(id))||
    !Number.isSafeInteger(input.value)||input.value<0||
    !Number.isSafeInteger(input.distinctContributors)||input.distinctContributors<0||
    input.distinctContributors>input.value)
    throw Error("Reconciled currently authorized relationship report evidence required");
  const digest=await relationshipDisclosureDigest(input.scope);
  await assertPublishedReportDisclosure(input.approval,{scopeDigest:digest,
    audience:"organization:"+input.scope.recipientOrganizationId,asOf:input.scope.asOf},now);
  const suppressed=input.distinctContributors<RELATIONSHIP_MINIMUM_DISTINCT_CONTRIBUTORS;
  return {metric:input.scope.metric,population:input.scope.population,from:input.scope.from,to:input.scope.to,
    asOf:input.scope.asOf,status:suppressed?"suppressed" as const:"available" as const,
    value:suppressed?null:input.value};
}

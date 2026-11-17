/**
 * WS6 reusable dimension projection from already-authorized source facts.
 * THIS IS NOT AN AUTHORIZATION SERVICE. The caller must verify every active
 * operating Organization/Site grant before producing facts. Fail closed on
 * records outside those verified scopes; never use network membership as a
 * substitute for either grant.
 */
export type ParticipationReportingSource=
  "native_class_enrollment"|"noncredit_registration"|"school_enrollment"|"family_enrichment";
export type ParticipationReportingFact={
  source:ParticipationReportingSource;
  sourceId:string;
  personId:string;
  courseVersionId:string|null;
  programId:string|null;
  deliverySiteId:string;
  operatingOrganizationId:string;
  creditedOrganizationId:string|null; // attribution only, not a data grant
  registeredAt:string;
  currentStatus:string;
};
export type ReportingScopeProof={
  verifiedOrganizationIds:ReadonlySet<string>;
  verifiedSiteIds:ReadonlySet<string>;
};
export type ParticipationCount={
  registrations:number;uniquePeople:number;active:number;withdrawn:number;
};
export type ParticipationDimensionRow=ParticipationCount&{id:string};
export function assertAuthorizedReportFacts(
  facts:readonly ParticipationReportingFact[],proof:ReportingScopeProof,
):void{
  if(!proof.verifiedOrganizationIds.size||!proof.verifiedSiteIds.size)
    throw new Error("Verified Organization and Site reporting grants required");
  const keys=new Set<string>();
  for(const fact of facts){
    if(!fact.sourceId||!fact.personId||!fact.deliverySiteId||!fact.operatingOrganizationId)
      throw new Error("Source reporting identity and delivery Site required");
    const key=fact.source+":"+fact.sourceId;
    if(keys.has(key))throw new Error("Duplicate canonical participation source identity");
    keys.add(key);
    if(!proof.verifiedOrganizationIds.has(fact.operatingOrganizationId)||
       !proof.verifiedSiteIds.has(fact.deliverySiteId))
      throw new Error("Out-of-scope Organization or Site participation cannot be reported");
  }
}
function count(rows:readonly ParticipationReportingFact[]):ParticipationCount{
  return {
    registrations:rows.length,
    uniquePeople:new Set(rows.map(r=>r.personId)).size,
    active:rows.filter(r=>["registered","active"].includes(r.currentStatus)).length,
    withdrawn:rows.filter(r=>r.currentStatus==="withdrawn").length,
  };
}
function group(
  facts:readonly ParticipationReportingFact[],
  key:(row:ParticipationReportingFact)=>string|null,
):ParticipationDimensionRow[]{
  const grouped=new Map<string,ParticipationReportingFact[]>();
  for(const fact of facts){
    const id=key(fact);
    if(!id)continue;
    grouped.set(id,[...(grouped.get(id)??[]),fact]);
  }
  return [...grouped].sort(([a],[b])=>a.localeCompare(b))
    .map(([id,rows])=>({id,...count(rows)}));
}
export function rollupAuthorizedParticipation(
  facts:readonly ParticipationReportingFact[],
  proof:ReportingScopeProof,
  period:{from:string;to:string;asOf:string},
){
  assertAuthorizedReportFacts(facts,proof);
  const from=Date.parse(period.from),to=Date.parse(period.to),asOf=Date.parse(period.asOf);
  if(!Number.isFinite(from)||!Number.isFinite(to)||!Number.isFinite(asOf)||
     from>=to||from>asOf)throw new Error("Invalid reporting range");
  const inPeriod=facts.filter(f=>{
    const at=Date.parse(f.registeredAt);
    if(!Number.isFinite(at))throw new Error("Invalid canonical registration date");
    return at>=from&&at<to&&at<=asOf;
  });
  const totals=count(inPeriod);
  const sites=group(inPeriod,x=>x.deliverySiteId);
  const organizations=group(inPeriod,x=>x.operatingOrganizationId);
  const courses=group(inPeriod,x=>x.courseVersionId);
  const programs=group(inPeriod,x=>x.programId);
  if(sites.reduce((n,r)=>n+r.registrations,0)!==totals.registrations ||
     organizations.reduce((n,r)=>n+r.registrations,0)!==totals.registrations)
    throw new Error("Site and operator registration totals did not reconcile");
  // A person may appear in multiple Sites/Courses/Programs. Never add
  // unique-person subtotals as though these groups were mutually exclusive.
  return {asOf:period.asOf,period:{from:period.from,to:period.to},totals,
    sites,organizations,courses,programs,
    exclusions:"Standalone Courses do not create synthetic Program membership",
    networkReportAvailable:false as const};
}

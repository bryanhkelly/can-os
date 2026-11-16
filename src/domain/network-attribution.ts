/** Deterministic, duplicate-safe aggregates of authoritative enrollment evidence.
 * Every row represents one registration. Higher hierarchy levels are views of
 * those SAME facts, not additional participants or enrollments. */
export type NetworkAttributionBasis="provider_default"|"self_reported"|"verified_member";
export interface HistoricalNetworkUnit {
  id:string; name:string; code:string;
}
export interface AttributionEvidence {
  registrationId:string;
  creditedOrganizationId:string;
  organizationName:string;
  networkMembershipId:string|null;
  reportingUnitId:string|null;
  reportingUnitName:string|null;
  basis:NetworkAttributionBasis;
  path:readonly HistoricalNetworkUnit[]|null;
  completed:boolean;
  verifiedAttendee:boolean;
}
export function rollupAttributionEvidence(rows:readonly AttributionEvidence[]){
  const registrations=new Set<string>();
  const affiliates=new Map<string,{
    organizationId:string;organizationName:string;reportingUnitId:string|null;
    reportingUnitName:string|null;basis:NetworkAttributionBasis;
    registrations:number;completed:number;verifiedAttendees:number;
  }>();
  const units=new Map<string,{
    unitId:string;unitCode:string;unitName:string;
    registrations:number;completed:number;verifiedAttendees:number;
  }>();
  for(const row of rows){
    if(registrations.has(row.registrationId))
      throw new Error("A registration cannot be counted twice");
    registrations.add(row.registrationId);
    if(row.basis!=="provider_default" && (!row.networkMembershipId || !row.path?.length))
      throw new Error("Network attribution requires historical membership and path");
    if(row.basis==="provider_default"&&row.networkMembershipId)
      throw new Error("A provider-default attribution cannot claim a membership");
    // A single membership can be reassigned to a different district. Preserve
    // separate historic affiliate groups rather than attaching old counts to
    // whichever district happened to be recorded first.
    const historicalLeaf=row.path?.length?row.path[row.path.length-1]:null;
    const affiliateKey=[row.creditedOrganizationId,row.networkMembershipId??"",
      historicalLeaf?.id??"",row.basis].join(":");
    const aggregate=affiliates.get(affiliateKey)??{
      organizationId:row.creditedOrganizationId,organizationName:row.organizationName,
      reportingUnitId:historicalLeaf?.id??null,
      reportingUnitName:historicalLeaf?.name??null,
      basis:row.basis,registrations:0,completed:0,verifiedAttendees:0,
    };
    aggregate.registrations++;
    if(row.completed)aggregate.completed++;
    if(row.verifiedAttendee)aggregate.verifiedAttendees++;
    affiliates.set(affiliateKey,aggregate);
    const visited=new Set<string>();
    for(const node of row.path??[]){
      if(!node.id||!node.name||!node.code||visited.has(node.id))
        throw new Error("Invalid or cyclic historical reporting path");
      visited.add(node.id);
      const unit=units.get(node.id)??{
        unitId:node.id,unitCode:node.code,unitName:node.name,
        registrations:0,completed:0,verifiedAttendees:0,
      };
      if(unit.unitName!==node.name || unit.unitCode!==node.code)
        throw new Error("Conflicting historical unit identity");
      unit.registrations++;
      if(row.completed)unit.completed++;
      if(row.verifiedAttendee)unit.verifiedAttendees++;
      units.set(node.id,unit);
    }
    if(row.basis!=="provider_default" &&
      (row.reportingUnitId!==historicalLeaf?.id ||
       row.reportingUnitName!==historicalLeaf?.name))
      throw new Error("Attributed reporting unit differs from immutable historical path");
  }
  const groups=[...affiliates.values()].sort((a,b)=>
    a.organizationName.localeCompare(b.organizationName));
  if(groups.reduce((n,a)=>n+a.registrations,0)!==rows.length)
    throw new Error("Attributed registrations did not reconcile");
  return {
    affiliations:groups,
    networkUnits:[...units.values()].sort((a,b)=>a.unitName.localeCompare(b.unitName)),
    uniqueRegistrations:rows.length,
  };
}

/** A historic snapshot is user-independent evidence read from canonical JSON.
 * Malformed paths must fail reporting, never silently skip a jurisdiction. */
export function decodeHistoricalNetworkPath(value:unknown):HistoricalNetworkUnit[]|null{
  if(value===undefined||value===null)return null;
  if(!Array.isArray(value))throw new Error("Historical reporting path is not an array");
  return value.map((item:unknown)=>{
    if(!item||typeof item!=="object"||Array.isArray(item))
      throw new Error("Invalid historical reporting unit");
    const node=item as Record<string,unknown>;
    if(typeof node.id!=="string"||typeof node.name!=="string"||
      typeof node.code!=="string")throw new Error("Invalid historical reporting unit");
    return {id:node.id,name:node.name,code:node.code};
  });
}

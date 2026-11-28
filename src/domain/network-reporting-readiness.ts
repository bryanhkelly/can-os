import {AuthorizationError} from "./command-context";
import type {AccessContext} from "./access-context";
import {assertNetworkSiteAccess} from "./network-site-policy";

/** HQ can inspect its own reporting setup; this is NOT the authority to execute cross-host reports. */
export function assertNetworkReportingReadinessReader(actor:AccessContext,organization:{id:string;type:string}){
  assertNetworkSiteAccess(actor,organization,"network.sites.read");
  if(!actor.accountId||!actor.grantId||actor.scope.organizationIds?.length!==1||
    actor.scope.organizationIds[0]!==organization.id||actor.sessionAccountId||actor.delegationMode||
    actor.delegatedByPlatformOwner||actor.impersonatedByAccountId)
    throw new AuthorizationError("direct verified denomination HQ reporting readiness reader");
}
export type NetworkReadinessCounts={
  configuredUnits:number;activeUnits:number;configuredMemberships:number;currentMemberships:number;
  configuredGrants:number;currentGrants:number;currentGrantHosts:number;
};
export function assessNetworkReportingReadiness(counts:NetworkReadinessCounts){
  if(Object.values(counts).some(value=>!Number.isSafeInteger(value)||value<0)||
    counts.activeUnits>counts.configuredUnits||counts.currentMemberships>counts.configuredMemberships||
    counts.currentGrants>counts.configuredGrants||counts.currentGrantHosts>counts.currentGrants)
    throw Error("Network reporting setup inventory does not reconcile");
  const blockers:string[]=[];
  if(!counts.activeUnits)blockers.push("No current network reporting units are configured.");
  if(!counts.currentMemberships)blockers.push("No current approved organizational reporting memberships are recorded.");
  if(!counts.currentGrants)blockers.push("No current host reporting grant records are present.");
  // Readiness describes the scope of data, never whether the dashboard can open.
  // A nonempty inventory is not proof of outcome access or disclosure authority.
  return {counts,blockers,classification:"private_setup_inventory" as const};
}

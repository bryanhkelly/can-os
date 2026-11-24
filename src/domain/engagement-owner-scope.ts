import type { EngagementOwner } from "./engagement-definition";

/** Client session identity only. Authorization remains in server commands. */
export function engagementOwnerScopeKey(siteId?:string,packageId?:string,owner?:EngagementOwner):string{
  return JSON.stringify([siteId,packageId,owner?.kind,
    owner?.kind==="organization"?owner.organizationId:owner?.kind==="site"?owner.siteId:null]);
}

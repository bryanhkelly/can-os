import type {CommandContext} from "./command-context";

/** Student authority comes from an exact original Site grant, not the
 * navigation scope expanded for organization-wide memberships. */
export function studentSiteScope(actor:CommandContext & {grantSiteId?:string|null}):{
  personId:string;siteId:string;organizationId:string;
}|null{
  const siteId=actor.grantSiteId;
  const organizationId=actor.scope.organizationIds?.[0];
  if(actor.role!=="student"||!actor.actorPersonId||!siteId||!organizationId||
     !actor.capabilities.has("student:read")||
     actor.scope.siteIds?.length!==1||actor.scope.siteIds[0]!==siteId||
     actor.scope.organizationIds?.length!==1)return null;
  return {personId:actor.actorPersonId,siteId,organizationId};
}

import type { AccessContext } from "@/domain/access-context";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { hasRegistrarAuthority } from "@/domain/school-roles";

/** Authority is from a verified server-side grant, never a URL/siteId hint. */
export function assertSiteSetupScope(
  actor: AccessContext,
  site: {id:string;organizationId:string}|null|undefined,
  capability:"program.read"|"program.launch.start",
): asserts site is {id:string;organizationId:string} {
  assertCapability(actor,capability);
  if(!actor.actorPersonId || !hasRegistrarAuthority(actor.role) ||
     !site || !actor.scope.organizationIds?.includes(site.organizationId) ||
     (actor.grantSiteId!==null && actor.grantSiteId!==site.id) ||
     (actor.scope.siteIds?.length && !actor.scope.siteIds.includes(site.id)))
    throw new AuthorizationError("verified registrar for this exact school Site");
}

/**
 * Physical location is a shared dependency of every Program at the Site.
 * A Site-scoped registrar cannot mutate its address without scope for every
 * attached Program; organization-wide registrars retain their organization grant.
 */
export function assertSiteLocationProgramScope(
  actor:AccessContext, affectedProgramIds:readonly string[],
):void {
  if(actor.grantSiteId!==null &&
    affectedProgramIds.some(id=>!actor.scope.programIds?.includes(id)))
    throw new AuthorizationError("all affected Site Programs must be in the registrar grant");
}

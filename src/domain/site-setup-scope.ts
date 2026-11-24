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

/** A scoped registrar must not interpret an absent Program projection as all
 * sibling Programs. Empty projections mean no Program reads, not unrestricted. */
export function siteSetupReadableProgramIds(actor:AccessContext):string[]|null {
  const ids=actor.scope.programIds;
  if(actor.grantSiteId!==null && !ids)
    throw new AuthorizationError("verified Program projection for this Site");
  return ids??null;
}

/** Shared whole-Site visibility rule for resources spanning Programs.
 * A verified Site-level registrar constrained to some Programs may not read
 * or manage links, reports or other Site-wide collections for sibling Programs.
 * Callers first enforce their own role and operation capability.
 */
export function assertWholeSiteProgramsInScope(
  actor:AccessContext, attachedProgramIds:readonly string[],
  context:"Site reporting"|"Site link management",
):void {
  if(actor.grantSiteId!==null){
    const allowed=new Set(actor.scope.programIds??[]);
    if(attachedProgramIds.some(id=>!allowed.has(id)))
      throw new AuthorizationError(context+" requires authority over every attached Program");
  }
}

/** Reporting must not reveal sibling Program evidence through Site summary. */
export function assertWholeSiteReportingScope(
  actor: AccessContext,
  site: { id: string; organizationId: string } | null | undefined,
  attachedProgramIds: readonly string[],
): void {
  assertSiteSetupScope(actor,site,"program.read");
  assertWholeSiteProgramsInScope(actor,attachedProgramIds,"Site reporting");
}

/**
 * Capturing a durable source snapshot is an audited mutation. A read-only
 * reporting grant is not sufficient to author one. The operating grant must
 * authorize the entire Site and the existing launch/write capability.
 */
export function assertWholeSiteSnapshotAuthoringScope(
  actor: AccessContext,
  site: {id:string;organizationId:string}|null|undefined,
  attachedProgramIds: readonly string[],
): void {
  assertWholeSiteReportingScope(actor,site,attachedProgramIds);
  assertSiteSetupScope(actor,site,"program.launch.start");
}

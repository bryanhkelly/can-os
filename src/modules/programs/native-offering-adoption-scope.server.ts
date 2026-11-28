import {assertCapability,AuthorizationError,type CommandContext} from "@/domain/command-context";
export function reviewerScope(actor:CommandContext):string{
  if(!actor.actorPersonId||actor.role!=="blueprint_reviewer"||
    actor.scope.organizationIds?.length!==1||actor.scope.siteIds?.length)
    throw new AuthorizationError("independent Organization-wide Blueprint reviewer");
  assertCapability(actor,"blueprint.review");
  return actor.scope.organizationIds[0]!;
}


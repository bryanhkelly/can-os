import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sites } from "@/db/schema";
import { catalogSites } from "@/db/canonical-v301";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";

/**
 * Exactly ONE Site identity. Until native tables are relocated to public,
 * verify an existing native Site with the SAME UUID, never a lookup bridge,
 * name match, new native identity or inferred operating grant.
 *
 * This is a temporary schema-compatibility guard, not a second Site identity.
 */
export type LaunchSiteCatalogScope =
  | {kind:"unlinked"|"blocked"}
  | {kind:"ready";canonicalSiteId:string;actor:CommandContext};

export async function resolveLaunchSiteCatalogContext(
  request:Request,publicSiteId:string,
):Promise<LaunchSiteCatalogScope>{
  const publicActor=await getCommandContext(request);
  const [site]=await db.select({id:sites.id,organizationId:sites.organizationId})
    .from(sites).where(eq(sites.id,publicSiteId)).limit(1);
  assertSiteSetupScope(publicActor,site,"program.read");

  // A Site is not operationally registered merely because its Site-first
  // profile exists. No duplicate identity is ever allocated or approved.
  const [nativeSite]=await db.select({id:catalogSites.id,status:catalogSites.status})
    .from(catalogSites).where(eq(catalogSites.id,site.id)).limit(1);
  if(!nativeSite||nativeSite.status==="closed")return {kind:"unlinked"};

  let actor:CommandContext;
  try {
    actor=await getCanonicalCommandContext(request);
  }catch(error){
    if(error instanceof AuthorizationError||error instanceof DomainError)
      return {kind:"blocked"};
    throw error;
  }
  if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??"")||
     !actor.scope.siteIds?.includes(site.id)||
     actor.scope.organizationIds?.length!==1||
     !actor.capabilities.has("program.launch.start"))
    return {kind:"blocked"};

  return {kind:"ready",canonicalSiteId:site.id,actor};
}

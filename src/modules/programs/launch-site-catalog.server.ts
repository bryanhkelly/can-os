import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sites } from "@/db/schema";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";

/** One authoritative public Site identity. Native Course/Offering grants
 * are independently checked by restricted canonical authorization; Site
 * existence or lifecycle alone never grants publication or enrollment. */
export type LaunchSiteCatalogScope =
  | {kind:"not_provisioned"|"blocked"}
  | {kind:"ready";canonicalSiteId:string;actor:CommandContext};

export async function resolveLaunchSiteCatalogContext(
  request:Request,publicSiteId:string,
):Promise<LaunchSiteCatalogScope>{
  const publicActor=await getCommandContext(request);
  const [site]=await db.select({
    id:sites.id,organizationId:sites.organizationId,
    lifecycleStatus:sites.lifecycleStatus,
  }).from(sites).where(eq(sites.id,publicSiteId)).limit(1);
  assertSiteSetupScope(publicActor,site,"program.read");

  // A legacy unclassified or closed Site cannot claim native readiness.
  // Do not read or provision a second Site. Operating grants are below.
  if(!site.lifecycleStatus||site.lifecycleStatus==="closed")
    return {kind:"not_provisioned"};

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

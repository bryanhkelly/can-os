import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { sites } from "@/db/schema";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";

/** Resolve the exact public Site and its independently approved canonical
 * counterpart. A client Site selector is never a canonical identity or grant.
 * Restricted CAN staff SSO revalidates the current Person, grant and link. */
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

  const links=await db.execute(sql`
    SELECT canonical_site_id AS "canonicalSiteId"
    FROM public.site_canonical_identity_links
    WHERE public_site_id=${site.id}::uuid AND status='approved'
      AND confirmed_at IS NOT NULL AND reviewed_at IS NOT NULL
    LIMIT 2
  `);
  if(links.rows.length!==1||typeof links.rows[0]?.canonicalSiteId!=="string")
    return {kind:"unlinked"};
  let actor:CommandContext;
  try {
    actor=await getCanonicalCommandContext(request);
  }catch(error){
    if(error instanceof AuthorizationError||error instanceof DomainError)
      return {kind:"blocked"};
    throw error;
  }
  const canonicalSiteId=String(links.rows[0].canonicalSiteId);
  if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??"")||
     !actor.scope.siteIds?.includes(canonicalSiteId)||
     actor.scope.organizationIds?.length!==1||
     !actor.capabilities.has("program.launch.start"))
    return {kind:"blocked"};
  return {kind:"ready",canonicalSiteId,actor};
}

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sites } from "@/db/schema";
import { isPrivateCanSitePlanningAllowed } from "@/domain/canonical-site-availability";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import { accessSessionCookie } from "@/domain/access-tokens";
import { readCookie } from "@/domain/session-cookies";
import { getIdentityContext } from "@/modules/identity/command-context.server";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";

/**
 * A newly verified CAN Site Admin/Registrar already has authority to prepare
 * their own Site. Catalog planning must not require a second operator grant,
 * native staff identity or per-Organization PostgreSQL role provisioning.
 *
 * Only this server-side authentication path may mark a context as verified.
 * Plain CommandContext objects (including old reviewer sessions and tests)
 * can never opt into the CAN planning database path by setting a property.
 */
const verifiedCanPlanningContexts = new WeakSet<CommandContext>();
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function isVerifiedCanSitePlanning(context: CommandContext): boolean {
  return verifiedCanPlanningContexts.has(context);
}

/**
 * Keep native canonical reviewer, execution and learner paths unchanged.
 * A CAN cookie is never silently ignored on failure; invalid or revoked CAN
 * sessions cannot fall back to a native session with wider authority.
 */
export async function getBlueprintPlanningContext(request: Request): Promise<CommandContext> {
  if (!readCookie(request, accessSessionCookie)) {
    return getCanonicalCommandContext(request);
  }
  const actor = await getIdentityContext(request);
  if (actor.role !== "site_admin" && actor.role !== "registrar") {
    return getCanonicalCommandContext(request);
  }
  if (!actor.actorPersonId || actor.sessionAccountId ||
      !actor.scope.organizationIds || actor.scope.organizationIds.length !== 1 ||
      !actor.scope.siteIds?.length ||
      !actor.capabilities.has("program.launch.start")) {
    throw new AuthorizationError("current verified CAN Site planning grant");
  }
  const organizationId = actor.scope.organizationIds[0];
  if (!organizationId) {
    throw new AuthorizationError("current verified CAN Organization grant");
  }
  // getIdentityContext has already validated the current credential, Person and grant.
  // Private planning depends on the exact scoped role, not the credential type.

  // Capabilities granted here are *only* for private planning. Not review,
  // publishing, Deployment execution, Class activation or enrollment.
  const context: CommandContext = {
    actorPersonId: actor.actorPersonId,
    role: actor.role,
    capabilities: new Set(["blueprint.read", "blueprint.configure", "program.launch.start"]),
    scope: {
      organizationIds: [organizationId],
      siteIds: [...actor.scope.siteIds],
    },
  };
  verifiedCanPlanningContexts.add(context);
  return context;
}

/**
 * Recheck ownership using the current public Site row *inside* every planning
 * database transaction, including saves and resumed revisions. The session's
 * exact Site and Organization scope must both agree with the DB record.
 */
export async function assertVerifiedCanPlanningSite(
  tx: Tx,
  context: CommandContext,
  siteId: string,
  expectedOrganizationId?: string | null,
): Promise<string> {
  if (!isVerifiedCanSitePlanning(context)) {
    throw new AuthorizationError("verified CAN Site planning context");
  }
  if (!context.actorPersonId ||
      (context.role !== "site_admin" && context.role !== "registrar") ||
      !context.scope.siteIds?.includes(siteId) ||
      context.scope.organizationIds?.length !== 1) {
    throw new AuthorizationError("verified CAN exact Site scope");
  }
  const [site] = await tx.select({
    id: sites.id,
    organizationId: sites.organizationId,
    lifecycleStatus: sites.lifecycleStatus,
  }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site || !isPrivateCanSitePlanningAllowed(site.lifecycleStatus) ||
      site.organizationId !== context.scope.organizationIds[0] ||
      (expectedOrganizationId && site.organizationId !== expectedOrganizationId)) {
    throw new AuthorizationError("current CAN Site owner relationship");
  }
  return site.organizationId;
}

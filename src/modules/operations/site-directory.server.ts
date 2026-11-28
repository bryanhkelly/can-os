import { hasRegistrarAuthority } from "@/domain/school-roles";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, sites } from "@/db/schema";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { AuthorizationError } from "@/domain/command-context";

/** Enumerate only sites in both the authenticated site and organization scope. */
export async function listMySitesService(request:Request) {
  const actor = await getCommandContext(request);
  if (!actor.actorPersonId || !hasRegistrarAuthority(actor.role)) {
    throw new AuthorizationError("site.today.read");
  }
  const siteIds = actor.scope.siteIds ?? [];
  const organizationIds = actor.scope.organizationIds ?? [];
  if (!siteIds.length || !organizationIds.length) return [];
  return db.select({
    id: sites.id, name: sites.name, timezone: sites.timezone,
    slug: sites.slug, organizationSlug: organizations.slug,
    organizationName: organizations.name,
  }).from(sites)
    .innerJoin(organizations, eq(organizations.id, sites.organizationId))
    .where(and(inArray(sites.id, siteIds), inArray(sites.organizationId, organizationIds)))
    .orderBy(asc(sites.name));
}

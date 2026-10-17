import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, sites } from "@/db/schema";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { AuthorizationError } from "@/domain/command-context";

/** Enumerate only sites in both the authenticated site and organization scope. */
export const listMySites = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await getCommandContext(getRequest());
  if (!actor.actorPersonId || actor.role !== "registrar") {
    throw new AuthorizationError("site.today.read");
  }
  const siteIds = actor.scope.siteIds ?? [];
  const organizationIds = actor.scope.organizationIds ?? [];
  if (!siteIds.length || !organizationIds.length) return [];
  return db.select({
    id: sites.id, name: sites.name, timezone: sites.timezone,
    organizationName: organizations.name,
  }).from(sites)
    .innerJoin(organizations, eq(organizations.id, sites.organizationId))
    .where(and(inArray(sites.id, siteIds), inArray(sites.organizationId, organizationIds)))
    .orderBy(asc(sites.name));
});

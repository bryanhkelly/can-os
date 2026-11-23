import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { siteRouteAliases, sites } from "@/db/schema";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { validFriendlySlug } from "@/domain/friendly-site-urls";

const siteIdentity = z.object({
  organizationSlug: z.string().max(80).refine(validFriendlySlug),
  siteSlug: z.string().max(80).refine(validFriendlySlug),
}).strict();

/**
 * Resolve a human-readable address strictly inside an authenticated grant scope.
 * The target module must STILL independently authorize every resource read/write
 * against the resulting canonical UUID. Never use this as a capability grant.
 */
export const resolveAuthorizedSiteRoute = createServerFn({ method: "GET" })
  .validator((value: unknown) => siteIdentity.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getCommandContext(getRequest());
    if (!actor.actorPersonId || !actor.scope.organizationIds?.length) return null;
    // An explicitly empty Site scope means NO Sites. It must never become
    // unrestricted Organization access simply because length === 0.
    if (actor.scope.siteIds && actor.scope.siteIds.length === 0) return null;
    // Site-scoped grants must stay narrow even when the same Organization
    // has other Sites. Undefined scope means the actor's Organization-wide
    // grant may use Site readers, not that the alias confers any capability.
    const restrictions = actor.grantSiteId
      ? [eq(sites.id, actor.grantSiteId)]
      : actor.scope.siteIds
        ? [inArray(sites.id, actor.scope.siteIds)]
        : [];
    const [site] = await db.select({ id: sites.id })
      .from(siteRouteAliases)
      .innerJoin(sites, eq(sites.id, siteRouteAliases.siteId))
      .where(and(
        eq(siteRouteAliases.organizationSlug, data.organizationSlug),
        eq(siteRouteAliases.siteSlug, data.siteSlug),
        eq(siteRouteAliases.organizationId, sites.organizationId),
        inArray(sites.organizationId, actor.scope.organizationIds),
        ...restrictions,
      )).limit(1);
    return site?.id ?? null;
  });

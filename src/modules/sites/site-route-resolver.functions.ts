import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { organizations, sites } from "@/db/schema";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { validFriendlySlug } from "@/domain/friendly-site-urls";
import { scopedSiteRouteAccess } from "@/domain/site-route-access";

const siteIdentity = z.object({
  organizationSlug: z.string().max(80).refine(validFriendlySlug),
  siteSlug: z.string().max(80).refine(validFriendlySlug),
}).strict();

/** No historical aliases. Resolve only the current slugs, then let the
 * destination service authorize its canonical Site UUID independently. */
export const resolveAuthorizedSiteRoute = createServerFn({ method: "GET" })
  .validator((value: unknown) => siteIdentity.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const scope = scopedSiteRouteAccess(await getCommandContext(getRequest()));
    if (!scope) return null;
    const [site] = await db.select({ id: sites.id })
      .from(sites)
      .innerJoin(organizations, eq(organizations.id, sites.organizationId))
      .where(and(
        eq(organizations.slug, data.organizationSlug),
        eq(sites.slug, data.siteSlug),
        inArray(sites.organizationId, scope.organizationIds),
        inArray(sites.id, scope.siteIds),
      )).limit(1);
    return site?.id ?? null;
  });

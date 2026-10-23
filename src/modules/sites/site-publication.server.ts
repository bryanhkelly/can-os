import { db } from "@/db/client";
import { sitePublications, sites } from "@/db/schema";
import { assertCapability, AuthorizationError, type CommandContext } from "@/domain/command-context";
import { publicSiteHost, requirePublicSiteSlug } from "@/domain/public-site-address";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { eq } from "drizzle-orm";

/**
 * Bite 1: reserve an address with an authenticated, authorized actor.
 * This does NOT publish the Site, programs, pages, forms or registration.
 * Further publishing must be a separate permissioned, readiness-gated command.
 */
export async function reserveSitePublicAddress(
  actor: CommandContext,
  input: { siteId: string; slug: string },
): Promise<{ siteId: string; host: string; status: "draft" }> {
  assertCapability(actor, "program.launch.start");
  if (!actor.actorPersonId) throw new AuthorizationError("authenticated site publisher");
  const slug = requirePublicSiteSlug(input.slug);

  return db.transaction(async tx => {
    const [site] = await tx.select({ id: sites.id, organizationId: sites.organizationId })
      .from(sites).where(eq(sites.id, input.siteId)).limit(1);
    if (!site || !actor.scope.organizationIds?.includes(site.organizationId) ||
        (actor.scope.siteIds && !actor.scope.siteIds.includes(site.id))) {
      throw new AuthorizationError("site publication scope");
    }

    const [existing] = await tx.select({ slug: sitePublications.slug, status: sitePublications.status })
      .from(sitePublications).where(eq(sitePublications.siteId, site.id)).limit(1);
    if (existing) {
      if (existing.slug !== slug) throw new Error("Site public address is already reserved; renaming requires a separate reviewed operation.");
      return { siteId: site.id, host: publicSiteHost(slug), status: "draft" as const };
    }

    // Database uniqueness arbitrates concurrent claims from different organizations.
    // Conflicts roll back both reservation and mutation evidence.
    await tx.insert(sitePublications).values({ siteId: site.id, slug, status: "draft" });
    await writeAudit(tx, actor, {
      action: "site.public_address.reserve", entityType: "site", entityId: site.id,
      scope: { organizationId: site.organizationId, siteId: site.id },
      after: { host: publicSiteHost(slug), status: "draft" },
    });
    await emitEvent(tx, {
      eventType: "SitePublicAddressReserved", aggregateType: "site", aggregateId: site.id,
      actorPersonId: actor.actorPersonId, organizationId: site.organizationId,
      siteId: site.id, payload: { slug, status: "draft" },
    });
    return { siteId: site.id, host: publicSiteHost(slug), status: "draft" as const };
  });
}

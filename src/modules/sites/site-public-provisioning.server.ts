import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sitePublications } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import type { CommandContext } from "@/domain/command-context";
import { assertCapability, assertOrganizationScope, assertSiteScope } from "@/domain/command-context";
import { publicSiteHost, suggestedSitePublicSlugs } from "@/domain/public-site-address";
import { emitEvent, writeAudit } from "@/platform/mutation";

import { EventTypes } from "@/domain/event-types";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type SiteIdentity = { id: string; organizationId: string; slug: string };
type SiteDraft = { slug: string; host: string; status: "draft" | "published"; created: boolean };

function existingPublicAddress(row: { slug: string; status: string }): SiteDraft {
  if (row.status !== "draft" && row.status !== "published") {
    throw new Error("Site website publication state must be repaired before launch");
  }
  return { slug: row.slug, host: publicSiteHost(row.slug), status: row.status, created: false };
}

/**
 * Shared, transaction-bound reservation. No account grant, protected-claim
 * approval or publication is created. Reuse an existing Site reservation;
 * never reset a published Site to draft.
 */
async function ensureReservation(
  tx: Tx,
  actor: CommandContext,
  site: SiteIdentity,
  source: "site_onboarding" | "program_launch_existing_site",
): Promise<SiteDraft> {
  const [existing] = await tx.select({
    slug: sitePublications.slug, status: sitePublications.status,
  }).from(sitePublications).where(eq(sitePublications.siteId, site.id)).limit(1);
  if (existing) return existingPublicAddress(existing);

  for (const slug of suggestedSitePublicSlugs(site.slug, site.id)) {
    // The same transaction owns the site/program command, reservation, audit
    // and domain event. Unique constraints arbitrate concurrent claims.
    const [reserved] = await tx.insert(sitePublications)
      .values({ siteId: site.id, slug, status: "draft", publishedAt: null })
      .onConflictDoNothing()
      .returning({ siteId: sitePublications.siteId });

    if (!reserved) {
      // Another transaction may have reserved this Site concurrently rather
      // than taking the candidate slug. Re-read before trying another slug.
      const [concurrent] = await tx.select({
        slug: sitePublications.slug, status: sitePublications.status,
      }).from(sitePublications).where(eq(sitePublications.siteId, site.id)).limit(1);
      if (concurrent) return existingPublicAddress(concurrent);
      continue;
    }

    const host = publicSiteHost(slug);
    await writeAudit(tx, actor, {
      action: "site.public_address.reserve",
      entityType: "site", entityId: site.id,
      scope: { organizationId: site.organizationId, siteId: site.id },
      after: { host, status: "draft", source },
    });
    await emitEvent(tx, {
      eventType: EventTypes.SitePublicAddressReserved,
      aggregateType: "site", aggregateId: site.id,
      actorPersonId: actor.actorPersonId,
      organizationId: site.organizationId, siteId: site.id,
      payload: { slug, status: "draft", source },
    });
    return { slug, host, status: "draft", created: true };
  }

  throw new Error(
    "Suggested public addresses are already reserved. Change the Site slug or reserve an address through a publisher; the launch was not created.",
  );
}

/**
 * Original Site-creation flow: an organization-wide registrar creates a
 * canonical Site and private website reservation in one transaction.
 */
export async function provisionNewSitePublicationDraft(
  tx: Tx,
  actor: AccessContext,
  site: SiteIdentity,
): Promise<{ slug: string; host: string; status: "draft" }> {
  assertCapability(actor, "program.launch.start");
  assertOrganizationScope(actor, site.organizationId);
  if (actor.role !== "registrar" || !actor.actorPersonId || actor.grantSiteId !== null) {
    throw new Error("New Site draft provisioning requires an organization-wide registrar");
  }
  const result = await ensureReservation(tx, actor, site, "site_onboarding");
  if (!result.created || result.status !== "draft") {
    throw new Error("A new Site must not inherit an existing website publication");
  }
  return { slug: result.slug, host: result.host, status: "draft" };
}

/**
 * Missing launch connection: existing canonical Sites (including sites
 * created before website support) receive a private draft on the first real
 * Program launch. This follows the caller's verified Site/Organization scope;
 * it does not require or bestow the separate publisher approval capability.
 */
export async function ensureExistingSitePublicationDraftForLaunch(
  tx: Tx,
  actor: CommandContext,
  site: SiteIdentity,
): Promise<SiteDraft> {
  assertCapability(actor, "program.launch.start");
  assertOrganizationScope(actor, site.organizationId);
  assertSiteScope(actor, site.id);
  if (!actor.actorPersonId) {
    throw new Error("Only an authenticated launch operator can provision the Site draft");
  }
  return ensureReservation(tx, actor, site, "program_launch_existing_site");
}

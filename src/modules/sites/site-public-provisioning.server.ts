import { db } from "@/db/client";
import { sitePublications } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { assertCapability, assertOrganizationScope } from "@/domain/command-context";
import { publicSiteHost, suggestedSitePublicSlugs } from "@/domain/public-site-address";
import { emitEvent, writeAudit } from "@/platform/mutation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * PUB-12, draft-only. Invoked inside the authorized canonical Site-creation
 * transaction, after that Site is inserted. This function cannot publish,
 * approve institutional claims, or grant any person publishing permissions.
 * It never copies Site/Program facts into an independent website store.
 */
export async function provisionNewSitePublicationDraft(
  tx: Tx,
  actor: AccessContext,
  site: { id: string; organizationId: string; slug: string },
): Promise<{ slug: string; host: string; status: "draft" }> {
  assertCapability(actor, "program.launch.start");
  assertOrganizationScope(actor, site.organizationId);
  if (actor.role !== "registrar" || !actor.actorPersonId || actor.grantSiteId !== null) {
    throw new Error("New Site draft provisioning requires an organization-wide registrar");
  }

  for (const slug of suggestedSitePublicSlugs(site.slug, site.id)) {
    // Site PK and globally unique slug are arbitrated atomically by PostgreSQL.
    // The site's creation and address reservation roll back together.
    const [reserved] = await tx.insert(sitePublications)
      .values({ siteId: site.id, slug, status: "draft", publishedAt: null })
      .onConflictDoNothing()
      .returning({ siteId: sitePublications.siteId });

    if (!reserved) continue;
    const host = publicSiteHost(slug);
    await writeAudit(tx, actor, {
      action: "site.public_address.reserve",
      entityType: "site", entityId: site.id,
      scope: { organizationId: site.organizationId, siteId: site.id },
      after: { host, status: "draft", source: "site_onboarding" },
    });
    await emitEvent(tx, {
      eventType: "SitePublicAddressReserved",
      aggregateType: "site", aggregateId: site.id,
      actorPersonId: actor.actorPersonId,
      organizationId: site.organizationId, siteId: site.id,
      payload: { slug, status: "draft", source: "site_onboarding" },
    });
    return { slug, host, status: "draft" };
  }
  throw new Error(
    "Both suggested public addresses are reserved. Choose another Site slug and retry; no Site was created.",
  );
}

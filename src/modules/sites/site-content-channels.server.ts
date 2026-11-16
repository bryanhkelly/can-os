import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sites } from "@/db/schema";
import { siteContentChannelConfigSchema, readSiteContentChannelConfig,
  type SiteContentBlock } from "@/domain/site-content-channels";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { writeAudit } from "@/platform/mutation";
import { AuthorizationError } from "@/domain/command-context";
import { getRequest } from "@tanstack/react-start/server";

export async function readAuthorizedSiteContentChannels(siteId: string) {
  const actor = await getCommandContext(getRequest());
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  assertSiteSetupScope(actor, site, "program.read");
  return readSiteContentChannelConfig(site.metadata.websiteContentChannels);
}

/** Typed Site metadata document, not HTML injected into a page. A separate
 * update key coexists with Site intent and does not change Program records.
 * The row lock and expectedRevision prevent lost website editor updates. */
export async function saveAuthorizedSiteContentChannels(input: {
  siteId: string; expectedRevision: number; blocks: SiteContentBlock[];
}) {
  const actor = await getCommandContext(getRequest());
  if (!actor.actorPersonId) throw new AuthorizationError("Site content channel editor");
  return db.transaction(async tx => {
    const [site] = await tx.select().from(sites)
      .where(eq(sites.id, input.siteId)).for("update").limit(1);
    assertSiteSetupScope(actor, site, "program.launch.start");
    const current = readSiteContentChannelConfig(site.metadata.websiteContentChannels);
    if (current.revision !== input.expectedRevision)
      throw new Error("Site content channels have changed. Reload before saving.");
    const next = siteContentChannelConfigSchema.parse({
      version: 1, revision: current.revision + 1, blocks: input.blocks,
    });
    if (JSON.stringify(current.blocks) === JSON.stringify(next.blocks))
      return current;
    const [updated] = await tx.update(sites).set({
      metadata: {...site.metadata, websiteContentChannels: next},
      updatedAt: new Date(),
    }).where(eq(sites.id, site.id)).returning({id: sites.id});
    if (!updated) throw new Error("Site content channels could not be saved");
    await writeAudit(tx, actor, {
      action: "site.website.content_channels.update",
      entityType: "site", entityId: site.id,
      scope: {siteId: site.id, organizationId: site.organizationId},
      before: {revision: current.revision, channels: current.blocks.map(b => b.channel)},
      after: {revision: next.revision, channels: next.blocks.map(b => b.channel)},
    });
    return next;
  });
}

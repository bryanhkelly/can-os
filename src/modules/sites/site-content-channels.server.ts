import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sites } from "@/db/schema";
import { siteContentChannelConfigSchema, readSiteContentChannelConfig,
  type SiteContentBlock } from "@/domain/site-content-channels";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { writeAudit } from "@/platform/mutation";
import { AuthorizationError } from "@/domain/command-context";
import { requirePartnerWebsiteEditor } from "./site-website-authorization.server";
import { siteWebsiteLocalPublishCapability } from "@/domain/site-publication-policy";
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


/** Explicit public-presentation snapshot. Saving a block changes only the
 * private draft. The currently published website never reads draft metadata.
 * Public Program facts and enrollment rights still come from approved feeds. */
export async function publishAuthorizedSiteContentChannels(input: {
  siteId: string; expectedRevision: number;
}) {
  const actor = await getCommandContext(getRequest());
  if (!actor.actorPersonId) throw new AuthorizationError("Website content publisher");
  return db.transaction(async tx => {
    const editor = await requirePartnerWebsiteEditor(actor, tx, siteWebsiteLocalPublishCapability);
    if (editor.id !== input.siteId) throw new AuthorizationError("exact Site website publisher");
    const [site] = await tx.select().from(sites)
      .where(eq(sites.id, input.siteId)).for("update").limit(1);
    if (!site) throw new AuthorizationError("own Site website");
    const draft = readSiteContentChannelConfig(site.metadata.websiteContentChannels);
    if (draft.revision !== input.expectedRevision)
      throw new Error("Website channel revision has changed. Reload before publishing.");
    const published = siteContentChannelConfigSchema.safeParse(site.metadata.publishedWebsiteContentChannels);
    if (published.success && published.data.revision === draft.revision)
      return {siteId: site.id, publishedRevision: draft.revision, changed: false};
    const [updated] = await tx.update(sites).set({
      metadata: {...site.metadata, publishedWebsiteContentChannels: draft},
      updatedAt: new Date(),
    }).where(eq(sites.id, site.id)).returning({id: sites.id});
    if (!updated) throw new Error("Unable to publish Site content channel settings");
    await writeAudit(tx, actor, {
      action: "site.website.content_channels.publish",
      entityType: "site", entityId: site.id,
      scope: {siteId: site.id, organizationId: site.organizationId},
      before: {publishedRevision: published.success ? published.data.revision : null},
      after: {publishedRevision: draft.revision,
        publishedSources: draft.blocks.filter(b => b.enabled && b.channel !== "learning.interests")
          .map(b => b.channel)},
    });
    return {siteId: site.id, publishedRevision: draft.revision, changed: true};
  });
}

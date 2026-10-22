import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { asc, and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, sites } from "@/db/schema";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { AuthorizationError } from "@/domain/command-context";
import { assertNetworkSiteAccess, assertIanaTimezone } from "@/domain/network-site-policy";
import { EventTypes } from "@/domain/event-types";
import { emitEvent, writeAudit } from "@/platform/mutation";

async function hq(capability: "network.sites.read" | "network.sites.manage" | "network.affiliations.read" | "network.affiliations.review") {
  const actor = await getCommandContext(getRequest());
  if (actor.role !== "network_admin" || actor.grantSiteId !== null)
    throw new AuthorizationError("denomination HQ administrator");
  const organizationIds = actor.scope.organizationIds ?? [];
  if (organizationIds.length !== 1) throw new AuthorizationError("single verified denomination HQ");
  const [organization] = await db.select({
    id: organizations.id, name: organizations.name, type: organizations.type,
  }).from(organizations).where(eq(organizations.id, organizationIds[0]!)).limit(1);
  if (!organization) throw new AuthorizationError("denomination organization");
  assertNetworkSiteAccess(actor, organization, capability);
  const { requireCurrentNetworkAgreement } = await import("./network-agreement.server");
  await requireCurrentNetworkAgreement(db, organization.id);
  return { actor, organization };
}

/** Headquarters can see its own directly operated sites, not affiliates' private records. */
export const getNetworkSites = createServerFn({ method: "GET" }).handler(async () => {
  const { organization } = await hq("network.sites.read");
  const locations = await db.select({
    id: sites.id, name: sites.name, slug: sites.slug, timezone: sites.timezone,
  }).from(sites).where(eq(sites.organizationId, organization.id))
    .orderBy(asc(sites.name));
  return { organization: { id: organization.id, name: organization.name }, sites: locations };
});

const createSiteInput = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  timezone: z.string().trim().min(3).max(80),
}).strict();

/**
 * Creates only a Site owned by this denomination. Independent churches and
 * schools keep their own organizations; affiliation is a separate approval
 * workflow, not a mutation of Site.organizationId or an academic access grant.
 */
export const createNetworkSite = createServerFn({ method: "POST" })
  .validator((input: unknown) => createSiteInput.parse(input))
  .handler(async ({ data }) => {
    const { actor, organization } = await hq("network.sites.manage");
    assertIanaTimezone(data.timezone);
    return db.transaction(async tx => {
      const [created] = await tx.insert(sites)
        .values({ organizationId: organization.id, name: data.name, slug: data.slug, timezone: data.timezone })
        .onConflictDoNothing()
        .returning({ id: sites.id });
      if (!created) {
        const [existing] = await tx.select({
          id: sites.id, name: sites.name, timezone: sites.timezone,
        }).from(sites).where(and(
          eq(sites.organizationId, organization.id),
          eq(sites.slug, data.slug),
        )).limit(1);
        if (!existing || existing.name !== data.name || existing.timezone !== data.timezone)
          throw new Error("Site slug is already in use with different details");
        return { siteId: existing.id, created: false };
      }

      await emitEvent(tx, {
        eventType: EventTypes.SiteCreated, aggregateType: "site", aggregateId: created.id,
        actorPersonId: actor.actorPersonId, organizationId: organization.id, siteId: created.id,
        payload: { name: data.name, timezone: data.timezone, source: "denomination_hq" },
      });
      await writeAudit(tx, actor, {
        action: "network.site.create", entityType: "site", entityId: created.id,
        scope: { organizationId: organization.id, siteId: created.id },
        after: { name: data.name, slug: data.slug, timezone: data.timezone },
      });
      return { siteId: created.id, created: true };
    });
  });

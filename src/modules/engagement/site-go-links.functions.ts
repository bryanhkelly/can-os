import { randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { siteGoLinks, siteMarketingPackages, sitePublications, sites } from "@/db/schema";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { DomainError } from "@/domain/errors";
import { goDestinationSchema, goDestinationHref } from "@/domain/site-go-links";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { publicSiteHost } from "@/domain/public-site-address";
import { writeAudit } from "@/platform/mutation";

const uuid = z.string().uuid();
const packageScope = z.object({ siteId: uuid, packageId: uuid }).strict();
const createSchema = packageScope.extend({ destination: goDestinationSchema }).strict();
const revokeSchema = packageScope.extend({ linkId: uuid }).strict();

async function authorizedPackage(
  siteId: string, packageId: string, write: boolean,
  reader: Pick<typeof db, "select"> = db,
) {
  const actor = await getCommandContext(getRequest());
  const [site] = await reader.select({
    id: sites.id, organizationId: sites.organizationId,
  }).from(sites).where(eq(sites.id, siteId)).limit(1);
  assertSiteSetupScope(actor, site, write ? "program.launch.start" : "program.read");
  const [pkg] = await reader.select({
    id: siteMarketingPackages.id, status: siteMarketingPackages.status,
  }).from(siteMarketingPackages).where(and(
    eq(siteMarketingPackages.id, packageId), eq(siteMarketingPackages.siteId, siteId),
  )).limit(1);
  if (!pkg) throw new DomainError("UNAVAILABLE", "Outreach plan unavailable for this Site.");
  return { actor, site: site!, pkg };
}

/** Create only immutable, scoped, public navigation. Editing an existing link is forbidden. */
export const createSiteGoLink = createServerFn({ method: "POST" })
  .validator((value: unknown) => createSchema.parse(value))
  .handler(async ({ data }) => db.transaction(async tx => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { actor, site, pkg } = await authorizedPackage(data.siteId, data.packageId, true, tx);
    if (pkg.status !== "draft")
      throw new DomainError("CONFLICT", "Restore the outreach plan before creating a link.");

    if (data.destination.kind === "site-page") {
      const [publication] = await tx.select({
        slug: sitePublications.slug, status: sitePublications.status,
        publishedAt: sitePublications.publishedAt,
      }).from(sitePublications).where(eq(sitePublications.siteId, site.id)).limit(1);
      if (publication?.status !== "published" || !publication.publishedAt)
        throw new DomainError("UNAVAILABLE", "Publish the Site website before linking to its public pages.");
      // Also validate the configured public hostname before creating a permanent link.
      publicSiteHost(publication.slug);
    }
    // Structural validation alone is not publication. An unavailable target
    // remains denied by its original destination's authoritative service.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomBytes(9).toString("base64url");
      if (!goDestinationHref(data.destination, code,
        data.destination.kind === "site-page" ? "valid.site.example" : null)) {
        throw new DomainError("VALIDATION_FAILED", "Select an available destination.");
      }
      const [created] = await tx.insert(siteGoLinks).values({
        code, siteId: site.id, organizationId: site.organizationId,
        packageId: pkg.id, createdByPersonId: actor.actorPersonId!,
        destination: data.destination,
      }).onConflictDoNothing({ target: siteGoLinks.code }).returning();
      if (!created) continue;
      await writeAudit(tx, actor, {
        action: "site.go_link.create", entityType: "site_go_link", entityId: created.id,
        scope: { siteId: site.id, organizationId: site.organizationId },
        after: { packageId: pkg.id, destination: data.destination.kind, status: created.status },
      });
      return {
        id: created.id, code: created.code, destination: created.destination,
        status: created.status, createdAt: created.createdAt.toISOString(),
      };
    }
    throw new DomainError("CONFLICT", "Unable to create a unique link. Try again.");
  }));

export const listSiteGoLinks = createServerFn({ method: "GET" })
  .validator((value: unknown) => packageScope.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    await authorizedPackage(data.siteId, data.packageId, false);
    const links = await db.select({
      id: siteGoLinks.id, code: siteGoLinks.code,
      destination: siteGoLinks.destination, status: siteGoLinks.status,
      createdAt: siteGoLinks.createdAt,
    }).from(siteGoLinks).where(and(
      eq(siteGoLinks.siteId, data.siteId), eq(siteGoLinks.packageId, data.packageId),
    )).orderBy(desc(siteGoLinks.createdAt));
    return links.flatMap(link => {
      const parsed=goDestinationSchema.safeParse(link.destination);
      return parsed.success ? [{
        ...link,destination:parsed.data,createdAt:link.createdAt.toISOString(),
      }] : [];
    });
  });

export const revokeSiteGoLink = createServerFn({ method: "POST" })
  .validator((value: unknown) => revokeSchema.parse(value))
  .handler(async ({ data }) => db.transaction(async tx => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { actor, site } = await authorizedPackage(data.siteId, data.packageId, true, tx);
    const [link] = await tx.select().from(siteGoLinks).where(and(
      eq(siteGoLinks.id, data.linkId), eq(siteGoLinks.siteId, site.id),
      eq(siteGoLinks.packageId, data.packageId),
    )).for("update").limit(1);
    if (!link) throw new DomainError("UNAVAILABLE", "Go link not found in this outreach plan.");
    if (link.status === "revoked") return { id: link.id, status: "revoked" as const };
    await tx.update(siteGoLinks).set({
      status: "revoked", updatedAt: new Date(),
    }).where(eq(siteGoLinks.id, link.id));
    await writeAudit(tx, actor, {
      action: "site.go_link.revoke", entityType: "site_go_link", entityId: link.id,
      scope: { siteId: site.id, organizationId: site.organizationId },
      before: { status: link.status }, after: { status: "revoked" },
    });
    return { id: link.id, status: "revoked" as const };
  }));

import { db } from "@/db/client";
import { memberships, organizations, people, programs, roleAssignments, sitePublications, sites } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { publicSiteHost, requirePublicSiteSlug } from "@/domain/public-site-address";
import { assertSitePublicationScope, sitePublicationManageCapability } from "@/domain/site-publication-policy";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

type Reader = Pick<typeof db, "select">;

/**
 * Both a verified registrar session and an explicitly granted institutional
 * publication capability are required. A network affiliation cannot confer
 * ownership or publication rights. Site-level grants never cover siblings.
 */
async function requireSitePublisher(actor: AccessContext, siteId: string, executor: Reader = db) {
  const [site] = await executor.select({
    id: sites.id, name: sites.name, slug: sites.slug,
    organizationId: sites.organizationId, organizationName: organizations.name,
  }).from(sites).innerJoin(organizations, eq(organizations.id, sites.organizationId))
    .where(eq(sites.id, siteId)).limit(1);

  if (!site) throw new AuthorizationError("site publication manager scope");
  assertSitePublicationScope(actor, site);

  const [grant] = await executor.select({ id: roleAssignments.id })
    .from(roleAssignments)
    .innerJoin(memberships, and(
      eq(memberships.personId, roleAssignments.personId),
      eq(memberships.organizationId, roleAssignments.organizationId),
    ))
    .innerJoin(people, eq(people.id, roleAssignments.personId))
    .where(and(
      eq(roleAssignments.personId, actor.actorPersonId!),
      eq(people.active, true),
      eq(roleAssignments.organizationId, site.organizationId),
      or(isNull(roleAssignments.siteId), eq(roleAssignments.siteId, site.id)),
      isNull(roleAssignments.programId),
      sql`${roleAssignments.capabilities} @> ${JSON.stringify([sitePublicationManageCapability])}::jsonb`,
    )).limit(1);

  if (!grant) throw new AuthorizationError("explicit site publication manager assignment");
  return site;
}

/** Private authenticated preview. This never serves as a public Host lookup. */
export async function getSitePublicationDraft(actor: AccessContext, siteId: string) {
  const site = await requireSitePublisher(actor, siteId);
  const [address, sitePrograms] = await Promise.all([
    db.select({ slug: sitePublications.slug, status: sitePublications.status })
      .from(sitePublications).where(eq(sitePublications.siteId, site.id)).limit(1),
    db.select({
      id: programs.id, name: programs.name, type: programs.type,
      status: programs.status, gradeRange: programs.gradeRange,
    }).from(programs).where(and(
      eq(programs.siteId, site.id),
      eq(programs.organizationId, site.organizationId),
      inArray(programs.id, actor.scope.programIds ?? []),
    )).orderBy(asc(programs.name)),
  ]);
  return {
    site,
    address: address[0] ? {
      host: publicSiteHost(address[0].slug),
      slug: address[0].slug,
      status: address[0].status,
    } : null,
    programs: sitePrograms,
  };
}

/**
 * Reserve an address without publishing any site, program or application.
 * Database uniqueness arbitrates concurrent reservations. Evidence is atomic.
 */
export async function reserveSitePublicAddress(
  actor: AccessContext,
  input: { siteId: string; slug: string },
): Promise<{ siteId: string; host: string; status: "draft" | "published" }> {
  const slug = requirePublicSiteSlug(input.slug);
  return db.transaction(async tx => {
    const site = await requireSitePublisher(actor, input.siteId, tx);
    const [created] = await tx.insert(sitePublications)
      .values({ siteId: site.id, slug, status: "draft" })
      .onConflictDoNothing()
      .returning({ siteId: sitePublications.siteId });

    if (!created) {
      const [existing] = await tx.select({
        slug: sitePublications.slug, status: sitePublications.status,
      }).from(sitePublications).where(eq(sitePublications.siteId, site.id)).limit(1);
      if (!existing) throw new Error("Public site address is already reserved by another site.");
      if (existing.slug !== slug) {
        throw new Error("Site public address is already reserved; renaming requires a separate reviewed operation.");
      }
      return { siteId: site.id, host: publicSiteHost(slug),
        status: existing.status === "published" ? "published" as const : "draft" as const };
    }

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

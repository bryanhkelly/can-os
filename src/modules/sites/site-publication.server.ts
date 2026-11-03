import { db } from "@/db/client";
import { memberships, organizations, people, programs, programPublications, roleAssignments, sitePublications, sites } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { publicSiteDomain, publicSiteHost, requirePublicSiteSlug } from "@/domain/public-site-address";
import { availablePublicSitePaths, renderPublicSiteHtml, withIllustrativeLocalPreview } from "@/domain/public-site-html";
import { assertSitePublicationScope, sitePublicationManageCapability } from "@/domain/site-publication-policy";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { toPublicSiteEnrichment } from "@/domain/public-site-catalog";
import { isAcademicMarketingType, isCurrentAcademicMarketingSnapshot } from "@/domain/academic-program-publication";
import { readAcademicProgramCatalog } from "./academic-program-catalog.server";
import { readCurrentLocalContent } from "./site-local-content.server";
import { projectApprovedParentInformation, withVerifiedPublicApplications } from "@/domain/parent-information";
import { readApprovedPublicParentExtras } from "./public-parent-extras.server";
import {readApprovedSchoolSitePhotos} from "./site-media-folder.server";
import {projectApprovedSchoolSiteMedia} from "@/domain/school-site-media-public";
import { planSitePublicationTransition, type SitePublicationAction } from "@/domain/site-publication-transition";
import { readEnrichmentCatalog } from "@/modules/activities/enrichment-catalog.server";
import { activeRoleAssignmentPredicate } from "@/modules/identity/role-assignment-state.server";
import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { EventTypes } from "@/domain/event-types";
type Reader = Pick<typeof db, "select">;

/**
 * Both a verified registrar session and an explicitly granted institutional
 * publication capability are required. A network affiliation cannot confer
 * ownership or publication rights. Site-level grants never cover siblings.
 */
export async function requireSitePublisher(actor: AccessContext, siteId: string, executor: Reader = db) {
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
      activeRoleAssignmentPredicate(),
      sql`${roleAssignments.capabilities} @> ${JSON.stringify([sitePublicationManageCapability])}::jsonb`,
    )).limit(1);

  if (!grant) throw new AuthorizationError("explicit site publication manager assignment");
  return site;
}

/** Private authenticated preview. This never serves as a public Host lookup. */
export async function getSitePublicationDraft(actor: AccessContext, siteId: string) {
  const site = await requireSitePublisher(actor, siteId);
  const [address, sitePrograms, publishedOfferings, approvedAcademicListings, localCopy] = await Promise.all([
    db.select({ slug: sitePublications.slug, status: sitePublications.status,
      updatedAt: sitePublications.updatedAt, publishedAt: sitePublications.publishedAt })
      .from(sitePublications).where(eq(sitePublications.siteId, site.id)).limit(1),
    db.select({
      id: programs.id, name: programs.name, type: programs.type,
      status: programs.status, gradeRange: programs.gradeRange,
      deliveryModel: programs.deliveryModel,
      marketingStatus: programPublications.status,
      marketingTitle: programPublications.title,
      marketingSummary: programPublications.summary,
      marketingGradeRange: programPublications.gradeRange,
      marketingDeliveryModel: programPublications.deliveryModel,
      marketingUpdatedAt: programPublications.updatedAt,
    }).from(programs)
      .leftJoin(programPublications, and(
        eq(programPublications.programId, programs.id),
        eq(programPublications.siteId, site.id),
      )).where(and(
      eq(programs.siteId, site.id),
      eq(programs.organizationId, site.organizationId),
      inArray(programs.id, actor.scope.programIds ?? []),
    )).orderBy(asc(programs.name)),
    // These Seasons already meet the CAN-wide enrichment publication policy,
    // but remain only a PRIVATE preview until the Site itself is published.
    readEnrichmentCatalog(site.id),
    // The preview is intentionally built from the same public-safe approved
    // academic catalog as the live host. Draft Program content stays internal.
    readAcademicProgramCatalog(site.id),
    readCurrentLocalContent(site.id),
  ]);
  const publicOfferings = publishedOfferings.map(toPublicSiteEnrichment);
  const approvedPhotos=address[0] ? await readApprovedSchoolSitePhotos(site.id) : [];
  const media=address[0] ? projectApprovedSchoolSiteMedia(site.id,publicSiteHost(address[0].slug),approvedPhotos) : {};
  const [siteConfiguration] = await db.select({metadata: sites.metadata})
    .from(sites).where(eq(sites.id, site.id)).limit(1);
  const parentExtras = await readApprovedPublicParentExtras(site.id,
    approvedAcademicListings.map(program => program.programId),
    siteConfiguration?.metadata ?? null);
  const authorizedPrograms=withVerifiedPublicApplications(approvedAcademicListings,
    parentExtras.admissions);
  const parentInformation = projectApprovedParentInformation({
    site: {name: site.name, organizationName: site.organizationName},
    academicPrograms: authorizedPrograms, offerings: publicOfferings,
    localContent: localCopy?.content ?? null, ...parentExtras,
  });
  // Render the same approved-source Site projection for every private page.
  // Synthetic demo starter copy is display-only and never written to Site CMS.
  const publisherPreview = address[0] ? withIllustrativeLocalPreview({
    demonstration: siteConfiguration?.metadata?.synthetic === true,
    host: publicSiteHost(address[0].slug),
    site: {name: site.name, organizationName: site.organizationName},
    academicPrograms: authorizedPrograms,
    localContent: localCopy?.content ?? null,
    offerings: publicOfferings,
    parentInformation,
    media,
  }) : null;
  const previewPages = publisherPreview ? Object.fromEntries(
    availablePublicSitePaths(publisherPreview).map(path => [path,
      renderPublicSiteHtml(publisherPreview, {path, localPreview:true})]),
  ) : {};
  return {
    site,
    canRename: actor.role === "site_admin" && actor.capabilities.has("school.setup.manage"),
    publicSiteDomain: publicSiteDomain(),
    localPreviewEnabled: process.env.CAN_PUBLIC_SITE_LOCAL_PREVIEW_ENABLED === "true",
    hostingConfigured: process.env.CAN_PUBLIC_SITE_HOSTING_ENABLED === "true",
    address: address[0] ? {
      host: publicSiteHost(address[0].slug),
      slug: address[0].slug,
      status: address[0].status,
      updatedAt: address[0].updatedAt.toISOString(),
      publishedAt: address[0].publishedAt?.toISOString() ?? null,
    } : null,
    programs: sitePrograms,
    academicPrograms: sitePrograms.filter(program => isAcademicMarketingType(program.type)).map(program => ({
      id: program.id, name: program.name, type: program.type,
      status: program.status, gradeRange: program.gradeRange,
      deliveryModel: program.deliveryModel,
      marketing: program.marketingStatus ? {
        status: program.marketingStatus, title: program.marketingTitle,
        summary: program.marketingSummary,
        catalogEligible: approvedAcademicListings.some(listing => listing.programId === program.id),
        current: Boolean(program.marketingTitle && program.marketingSummary &&
          program.marketingGradeRange && program.marketingDeliveryModel &&
          isCurrentAcademicMarketingSnapshot({
            title: program.marketingTitle,
            summary: program.marketingSummary,
            gradeRange: program.marketingGradeRange,
            deliveryModel: program.marketingDeliveryModel,
            programName: program.name,
            canonicalGrades: program.gradeRange,
            canonicalDelivery: program.deliveryModel,
          })),
        updatedAt: program.marketingUpdatedAt?.toISOString() ?? null,
      } : null,
    })),
    catalogPreview: publicOfferings,
    // Identical standalone HTML renderer to /published-site. No request ID
    // generator: this authenticated draft is read-only, not an inquiry form.
    // The client displays it inside an origin-isolated sandboxed iframe.
    previewHtml: previewPages["/"] ?? null,
    previewPages,
  };
}

/** Reviewed canonical rename, retaining publication approval and tenant identity. */
export async function changeSitePublicIdentity(
  actor: AccessContext,
  input: {
    siteId: string; name: string; slug: string; expectedName: string;
    expectedRevision: string; reason: string; contentReviewed: boolean;
  },
) {
  if (actor.role !== "site_admin" || !actor.capabilities.has("school.setup.manage")) {
    throw new AuthorizationError("Site Admin identity management");
  }
  const name = input.name.trim();
  const slug = requirePublicSiteSlug(input.slug);
  const reason = input.reason.trim();
  if (name.length < 2 || name.length > 120 ||
      Array.from(name).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
      reason.length < 10 || reason.length > 500 || !input.contentReviewed) {
    throw new DomainError("VALIDATION_FAILED", "Review the school name, address and rename reason.");
  }
  return db.transaction(async tx => {
    const authorized = await requireSitePublisher(actor, input.siteId, tx);
    const [site] = await tx.select().from(sites).where(eq(sites.id, authorized.id)).for("update");
    const [address] = await tx.select().from(sitePublications)
      .where(eq(sitePublications.siteId, authorized.id)).for("update");
    if (!site || !address) throw new DomainError("CONFLICT", "Reserve the Site address before renaming it.");
    if (site.name === name && site.slug === slug && address.slug === slug) {
      return { changed: false, siteId: site.id, name, slug };
    }
    if (site.name !== input.expectedName || address.updatedAt.toISOString() !== input.expectedRevision) {
      throw new DomainError("CONFLICT", "The Site identity or publication changed. Refresh before renaming.");
    }
    // Serialize competing rename commands; unique constraints also arbitrate reservations.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`site-public-address:${slug}`}))`);
    const [publicConflict] = await tx.select({ siteId: sitePublications.siteId })
      .from(sitePublications).where(and(eq(sitePublications.slug, slug), ne(sitePublications.siteId, site.id))).limit(1);
    const [siteConflict] = await tx.select({ id: sites.id }).from(sites).where(and(
      eq(sites.organizationId, site.organizationId), eq(sites.slug, slug), ne(sites.id, site.id),
    )).limit(1);
    if (publicConflict || siteConflict) throw new DomainError("CONFLICT", "The requested school address is already reserved.");
    const updatedAt = new Date(Math.max(Date.now(), address.updatedAt.getTime() + 1));
    await tx.update(sites).set({ name, slug, updatedAt }).where(eq(sites.id, site.id));
    await tx.update(sitePublications).set({ slug, updatedAt }).where(eq(sitePublications.siteId, site.id));
    const scope = { organizationId: site.organizationId, siteId: site.id };
    await writeAudit(tx, actor, {
      action: "site.public_identity.change", entityType: "site", entityId: site.id, scope,
      before: { name: site.name, siteSlug: site.slug, publicSlug: address.slug },
      after: { name, siteSlug: slug, publicSlug: slug, reason, contentReviewed: true },
    });
    await emitEvent(tx, {
      eventType: EventTypes.SitePublicIdentityChanged, aggregateType: "site", aggregateId: site.id,
      actorPersonId: actor.actorPersonId, ...scope,
      payload: { name, slug, previousSlug: address.slug, status: address.status },
    });
    return { changed: true, siteId: site.id, name, slug };
  });
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
      eventType: EventTypes.SitePublicAddressReserved, aggregateType: "site", aggregateId: site.id,
      actorPersonId: actor.actorPersonId, organizationId: site.organizationId,
      siteId: site.id, payload: { slug, status: "draft" },
    });
    return { siteId: site.id, host: publicSiteHost(slug), status: "draft" as const };
  });
}

/**
 * Controlled site-level marketing publication. This is distinct from each
 * offering's operator-approved enrichment publication and from registration.
 * A row lock serializes publish/unpublish decisions for one canonical Site.
 */
export async function changeSitePublication(
  actor: AccessContext,
  input: {
    siteId: string;
    action: SitePublicationAction;
    expectedRevision: string;
    reason: string;
    contentReviewed: boolean;
  },
): Promise<{ siteId: string; status: "draft" | "published"; publishedAt: string | null; updatedAt: string; changed: boolean }> {
  return db.transaction(async tx => {
    const site = await requireSitePublisher(actor, input.siteId, tx);
    const [current] = await tx.select({
      siteId: sitePublications.siteId, slug: sitePublications.slug,
      status: sitePublications.status, publishedAt: sitePublications.publishedAt,
      updatedAt: sitePublications.updatedAt,
    }).from(sitePublications).where(eq(sitePublications.siteId, site.id))
      .for("update").limit(1);
    if (!current) throw new Error("Reserve a public address before changing publication status");
    requirePublicSiteSlug(current.slug);

    // Only a changed-to-published state requires content readiness.
    // This queries the canonical published Seasons inside the same transaction.
    // Unpublishing is never prevented by empty or expired offerings.
    // Keep queries sequential on the same transactional connection.
    const needsReadiness = input.action === "publish" && current.status === "draft";
    const enrichmentListings = needsReadiness ? await readEnrichmentCatalog(site.id, tx) : [];
    const academicListings = needsReadiness ? await readAcademicProgramCatalog(site.id, tx) : [];
    const eligibleCount = enrichmentListings.length + academicListings.length;
    const decision = planSitePublicationTransition({
      current, action: input.action, expectedRevision: input.expectedRevision,
      reason: input.reason, contentReviewed: input.contentReviewed,
      eligibleOfferingCount: eligibleCount, now: new Date(),
    });
    if (!decision.changed) {
      return { siteId: site.id, status: decision.status,
        publishedAt: decision.publishedAt?.toISOString() ?? null,
        updatedAt: decision.updatedAt.toISOString(), changed: false };
    }

    const [updated] = await tx.update(sitePublications).set({
      status: decision.status, publishedAt: decision.publishedAt,
      updatedAt: decision.updatedAt,
    }).where(eq(sitePublications.siteId, site.id))
      .returning({ siteId: sitePublications.siteId });
    if (!updated) throw new Error("Site publication update failed");

    const scope = { organizationId: site.organizationId, siteId: site.id };
    await writeAudit(tx, actor, {
      action: input.action === "publish" ? "site.publication.publish" : "site.publication.unpublish",
      entityType: "site", entityId: site.id, scope,
      before: { status: current.status, publishedAt: current.publishedAt?.toISOString() ?? null,
        updatedAt: current.updatedAt.toISOString() },
      after: { status: decision.status, publishedAt: decision.publishedAt?.toISOString() ?? null,
        updatedAt: decision.updatedAt.toISOString(), reason: input.reason.trim(),
        contentReviewed: input.action === "publish" && input.contentReviewed,
        eligibleOfferingCount: input.action === "publish" ? eligibleCount : null },
    });
    await emitEvent(tx, {
      eventType: input.action === "publish" ? EventTypes.SitePublished : EventTypes.SiteUnpublished,
      aggregateType: "site", aggregateId: site.id, actorPersonId: actor.actorPersonId,
      ...scope,
      payload: { slug: current.slug, status: decision.status,
        publishedAt: decision.publishedAt?.toISOString() ?? null },
    });
    return { siteId: site.id, status: decision.status,
      publishedAt: decision.publishedAt?.toISOString() ?? null,
      updatedAt: decision.updatedAt.toISOString(), changed: true };
  });
}

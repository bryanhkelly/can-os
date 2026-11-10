import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { and, countDistinct, eq, inArray } from "drizzle-orm";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { AuthorizationError } from "@/domain/command-context";
import type { AccessContext } from "@/domain/access-context";
import { hasRegistrarAuthority, rolesAllow } from "@/domain/school-roles";
import { draftSiteContactSchema, readSitePhysicalAddress } from "@/domain/site-setup-configuration";
import { db } from "@/db/client";
import { enrollments, organizations, programs, sitePublications, sites } from "@/db/schema";
import { readSchoolBrand } from "@/modules/sites/school-brand.server";
import { publicSiteHost } from "@/domain/public-site-address";

/**
 * Shared school record. Every active member of the exact school reads the same
 * canonical facts; role controls management links, never the facts themselves.
 */
async function readSchoolProfile(actor: AccessContext, siteId: string) {
  const [site] = await db.select({
    id: sites.id, organizationId: sites.organizationId, name: sites.name,
    timezone: sites.timezone, address: sites.address, metadata: sites.metadata,
  }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!actor.actorPersonId || !site ||
      !actor.scope.organizationIds?.includes(site.organizationId) ||
      (actor.grantSiteId !== null && actor.grantSiteId !== site.id) ||
      (actor.scope.siteIds?.length && !actor.scope.siteIds.includes(site.id)))
    throw new AuthorizationError("active membership at this school");

  const [[organization], attached, [publication], brand] = await Promise.all([
    db.select({ name: organizations.name }).from(organizations)
      .where(eq(organizations.id, site.organizationId)).limit(1),
    db.select({
      id: programs.id, name: programs.name, type: programs.type,
      status: programs.status, gradeRange: programs.gradeRange,
    }).from(programs).where(eq(programs.siteId, site.id)),
    db.select({ status: sitePublications.status, slug: sitePublications.slug }).from(sitePublications)
      .where(eq(sitePublications.siteId, site.id)).limit(1),
    readSchoolBrand(site.id),
  ]);
  const counts = attached.length ? await db.select({
    programId: enrollments.programId,
    activeStudents: countDistinct(enrollments.studentProfileId),
  }).from(enrollments).where(and(
    inArray(enrollments.programId, attached.map(program => program.id)),
    eq(enrollments.kind, "program"),
    eq(enrollments.status, "active"),
  )).groupBy(enrollments.programId) : [];

  const { requireSitePublisher } = await import("@/modules/sites/site-publication.server");
  const canPublish = await requireSitePublisher(actor, site.id).then(() => true, (error: unknown) => {
    if (error instanceof AuthorizationError) return false;
    throw error;
  });
  const physical = readSitePhysicalAddress(site.address);
  const contactParse = draftSiteContactSchema.safeParse(site.metadata.setupContact);
  return {
    id: site.id,
    name: site.name,
    brand,
    timezone: site.timezone,
    organization: { id: site.organizationId, name: organization?.name ?? null },
    physicalLocation: { value: physical.value, configurationStatus: physical.status },
    contact: {
      value: contactParse.success ? contactParse.data : null,
      configurationStatus: site.metadata.setupContact == null ? "unconfigured" as const
        : contactParse.success ? "church_supplied" as const : "legacy_needs_review" as const,
    },
    programs: attached.map(program => ({
      ...program,
      activeStudents: counts.find(count => count.programId === program.id)?.activeStudents ?? 0,
    })),
    publication: {
      status: publication?.status ?? "unconfigured" as const,
      // An approved catalog is not a verified or externally reachable website.
      defaultUrl: publication?.slug ? `https://${publicSiteHost(publication.slug)}` : null,
      hostingConfigured: process.env.CAN_PUBLIC_SITE_HOSTING_ENABLED === "true",
      url: publication?.status === "published" ? brand?.websiteUrl ?? null : null,
    },
    viewer: {
      canManageSchool: hasRegistrarAuthority(actor.role),
      canPublish,
      canOpenSiteToday: rolesAllow(["registrar", "site_leader"], actor.role),
    },
  };
}

export const getSchoolProfile = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ siteId: z.string().uuid() }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getCommandContext(getRequest());
    return readSchoolProfile(actor, data.siteId);
  });

/** Resolve the member's school from the verified grant, never caller input. */
export const getMySchoolProfile = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getCommandContext(getRequest());
    const siteId = actor.grantSiteId
      ?? (actor.scope.siteIds?.length === 1 ? actor.scope.siteIds[0]! : null);
    if (!siteId) return null;
    return readSchoolProfile(actor, siteId);
  });
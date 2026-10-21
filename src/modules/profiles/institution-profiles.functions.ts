import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { db } from "@/db/client";
import { jurisdictions, organizations, programs, sites } from "@/db/schema";
import { getCommandContext } from "@/modules/identity/command-context.server";

const idInput = z.object({ id: z.string().uuid() });

async function profileContext() {
  const context = await getCommandContext(getRequest());
  assertCapability(context, "institution.profile.read");
  if (!context.actorPersonId) {
    throw new AuthorizationError("institution profile membership");
  }
  setResponseHeader("Cache-Control", "private, no-store");
  return context;
}

/** Read an Organization profile from canonical Organization, Site, and Program records. */
export const getOrganizationProfile = createServerFn({ method: "GET" })
  .validator((input: unknown) => idInput.parse(input))
  .handler(async ({ data }) => {
    const context = await profileContext();
    if (!context.scope.organizationIds?.includes(data.id)) {
      throw new AuthorizationError("organization profile scope");
    }

    const [organization] = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        legalName: organizations.legalName,
        slug: organizations.slug,
        type: organizations.type,
      })
      .from(organizations)
      .where(eq(organizations.id, data.id))
      .limit(1);
    if (!organization) throw new AuthorizationError("organization profile scope");

    const siteScope = context.scope.siteIds ?? [];
    const visibleSites = siteScope.length
      ? await db
          .select({
            id: sites.id,
            name: sites.name,
            slug: sites.slug,
            timezone: sites.timezone,
          })
          .from(sites)
          .where(and(eq(sites.organizationId, organization.id), inArray(sites.id, siteScope)))
          .orderBy(asc(sites.name))
      : [];

    const programIds = context.scope.programIds ?? [];
    const visiblePrograms = programIds.length
      ? await db
          .select({
            id: programs.id,
            name: programs.name,
            type: programs.type,
            status: programs.status,
            siteId: programs.siteId,
            gradeRange: programs.gradeRange,
            deliveryModel: programs.deliveryModel,
            jurisdictionName: jurisdictions.name,
          })
          .from(programs)
          .innerJoin(jurisdictions, eq(jurisdictions.id, programs.jurisdictionId))
          .where(
            and(
              eq(programs.organizationId, organization.id),
              inArray(programs.id, programIds),
            ),
          )
          .orderBy(asc(programs.name))
      : [];

    return { organization, sites: visibleSites, programs: visiblePrograms };
  });

/** Read a Site profile and only the Programs visible in the current verified scope. */
export const getSiteProfile = createServerFn({ method: "GET" })
  .validator((input: unknown) => idInput.parse(input))
  .handler(async ({ data }) => {
    const context = await profileContext();
    if (!context.scope.siteIds?.includes(data.id)) {
      throw new AuthorizationError("site profile scope");
    }

    const [site] = await db
      .select({
        id: sites.id,
        organizationId: sites.organizationId,
        name: sites.name,
        slug: sites.slug,
        address: sites.address,
        timezone: sites.timezone,
        organizationName: organizations.name,
        organizationType: organizations.type,
      })
      .from(sites)
      .innerJoin(organizations, eq(organizations.id, sites.organizationId))
      .where(eq(sites.id, data.id))
      .limit(1);
    if (!site || !context.scope.organizationIds?.includes(site.organizationId)) {
      throw new AuthorizationError("site profile scope");
    }

    const address = {
      line1: typeof site.address?.line1 === "string" ? site.address.line1 : null,
      city: typeof site.address?.city === "string" ? site.address.city : null,
      region: typeof site.address?.region === "string" ? site.address.region : null,
      postalCode: typeof site.address?.postalCode === "string" ? site.address.postalCode : null,
      country: typeof site.address?.country === "string" ? site.address.country : null,
    };
    const hasAddress = Object.values(address).some(Boolean);

    const programIds = context.scope.programIds ?? [];
    const visiblePrograms = programIds.length
      ? await db
          .select({
            id: programs.id,
            name: programs.name,
            type: programs.type,
            status: programs.status,
            gradeRange: programs.gradeRange,
            deliveryModel: programs.deliveryModel,
            jurisdictionName: jurisdictions.name,
          })
          .from(programs)
          .innerJoin(jurisdictions, eq(jurisdictions.id, programs.jurisdictionId))
          .where(
            and(
              eq(programs.organizationId, site.organizationId),
              eq(programs.siteId, site.id),
              inArray(programs.id, programIds),
            ),
          )
          .orderBy(asc(programs.name))
      : [];

    return { site: { ...site, address: hasAddress ? address : null }, programs: visiblePrograms };
  });

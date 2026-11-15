import { and, asc, eq, isNotNull } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { db } from "@/db/client";
import { sitePublications, sites } from "@/db/schema";
import { readPublishedSiteCatalog } from "@/modules/sites/site-public-catalog.server";
import { availablePublicSitePaths } from "@/domain/public-site-html";
import { publicSiteHost } from "@/domain/public-site-address";

/**
 * Public, approved discovery only. No account membership, draft copy, student
 * record or facility qualification may be inferred from a listing.
 *
 * This bounded first page is intentional. The next release should add
 * cursor pagination instead of silently presenting it as a nationwide index.
 */
export const getMyCanDiscoverablePrograms = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeader("Cache-Control", "public, max-age=30");
    const candidates = await db.select({
      slug: sitePublications.slug,
      siteName: sites.name,
      address: sites.address,
    }).from(sitePublications)
      .innerJoin(sites, eq(sites.id, sitePublications.siteId))
      .where(and(eq(sitePublications.status, "published"),
        isNotNull(sitePublications.publishedAt)))
      .orderBy(asc(sites.name))
      .limit(20);
    const locations: {
      slug: string; siteName: string; organizationName: string;
      city: string | null; region: string | null;
      siteUrl: string; programs: {
        id: string; title: string; description: string;
        category: "school" | "community"; status: string;
        destination: string; registrationOpen: boolean;
      }[];
    }[] = [];
    for (const site of candidates) {
      // Do not advertise synthetic school fixtures or a withdrawn publisher.
      const catalog = await readPublishedSiteCatalog(site.slug);
      if (!catalog || catalog.demonstration) continue;
      const pages = availablePublicSitePaths(catalog);
      const siteUrl = `https://${publicSiteHost(site.slug)}`;
      const schoolDestination = pages.includes("/admissions") ?
        siteUrl + "/admissions" : siteUrl + "/";
      const enrichmentDestination = pages.includes("/student-life") ?
        siteUrl + "/student-life" : siteUrl + "/";
      const programs = [
        ...catalog.academicPrograms.map(program => ({
          id: program.programId, title: program.title, description: program.summary,
          category: "school" as const,
          status: program.availability === "operating" ? "Operating" : "Planned",
          registrationOpen: program.applicationOpen === true,
          destination: schoolDestination,
        })),
        ...catalog.offerings.map(offering => ({
          id: offering.seasonId, title: offering.title,
          description: `${offering.programName} · ${offering.season}`,
          category: "community" as const, status: offering.registrationOpen ?
            "Registration open" : "Registration unavailable",
          registrationOpen: offering.registrationOpen,
          destination: enrichmentDestination,
        })),
      ];
      if (!programs.length) continue;
      locations.push({
        slug: site.slug, siteName: site.siteName,
        organizationName: catalog.site.organizationName,
        city: typeof site.address?.city === "string" ? site.address.city : null,
        region: typeof site.address?.region === "string" ? site.address.region : null,
        siteUrl: siteUrl + "/", programs,
      });
    }
    return { locations, isFirstPage: true };
  });

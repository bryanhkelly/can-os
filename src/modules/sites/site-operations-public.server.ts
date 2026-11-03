import { and,eq,isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { programs,sitePublications,sites } from "@/db/schema";
import { projectPublicFamilyServices } from "@/domain/site-family-services";
import { projectPublishedEnrichmentActivity } from "@/domain/activity-presentation";
import { projectPublicSchoolDay } from "@/domain/public-school-day";
import { readEnrichmentCatalog } from "@/modules/activities/enrichment-catalog.server";
import { readApprovedPublicSchoolDay } from "@/modules/academic-time/public-school-day.server";
import { readAcademicProgramCatalog } from "./academic-program-catalog.server";

/**
 * Narrow Agent C -> Agent A adapter. Safe output only, gated by one locked,
 * currently published canonical Site and exact owning Program.
 *
 * This is not an anonymous HTTP route. Agent A/B decide public-host routing,
 * institutional disclosure approval, and final rendering.
 */
export async function readPublishedSiteOperationFragments(
  siteId: string,programId: string,
) {
  return db.transaction(async tx=>{
    const [scope]=await tx.select({
      siteId:sites.id,siteOrganizationId:sites.organizationId,
      metadata:sites.metadata,programId:programs.id,
      programSiteId:programs.siteId,programOrganizationId:programs.organizationId,
      publicationStatus:sitePublications.status,
      publishedAt:sitePublications.publishedAt,
    }).from(sitePublications)
      .innerJoin(sites,eq(sites.id,sitePublications.siteId))
      .innerJoin(programs,eq(programs.siteId,sites.id))
      .where(and(eq(sites.id,siteId),eq(programs.id,programId),
        eq(sitePublications.status,"published"),
        isNotNull(sitePublications.publishedAt)))
      .for("share",{of:sitePublications}).limit(1);
    if(!scope || scope.programId!==programId ||
      scope.programSiteId!==siteId ||
      scope.siteOrganizationId!==scope.programOrganizationId)
      return null;
    // Academic program listing also requires independent, live operating
    // agreement and reviewed snapshot. No academic school-day claim otherwise.
    const academic=await readAcademicProgramCatalog(siteId,tx);
    const publishedAcademic=academic.some(p=>p.programId===programId);
    const offerings=await readEnrichmentCatalog(siteId,tx);
    const activities=offerings.map(entry=>projectPublishedEnrichmentActivity({
      name:entry.name,seasonName:entry.seasonName,
      startsOn:entry.startsOn,endsOn:entry.endsOn,
      registrationOpen:entry.registrationOpen,
      seatsRemaining:entry.seatsRemaining,packages:entry.packages,
    }));
    const schoolDay=publishedAcademic
      ? await readApprovedPublicSchoolDay(siteId,programId,tx)
      : projectPublicSchoolDay([],"UTC");
    return {
      siteId,programId,activities,schoolDay,
      services:projectPublicFamilyServices(scope.metadata),
    };
  });
}

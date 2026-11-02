import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { programPublications, programs, sites } from "@/db/schema";
import { isCurrentAcademicMarketingSnapshot, publishableAcademicProgram, publicAcademicProgram } from "@/domain/academic-program-publication";
import { AuthorizationError } from "@/domain/command-context";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";

/**
 * Canonical Program-to-public-listing projection; approved snapshots ONLY.
 * Invoked by both private publisher previews and Site-gated public reads.
 * A Site ID is mandatory, and authorization is handled by the calling API.
 */
export async function readAcademicProgramCatalog(
  siteId: string,
  executor: Pick<typeof db, "select"> = db,
) {
  const rows = await executor.select({
    programId: programPublications.programId,
    publicationSiteId: programPublications.siteId,
    title: programPublications.title,
    summary: programPublications.summary,
    gradeRange: programPublications.gradeRange,
    deliveryModel: programPublications.deliveryModel,
    type: programs.type,
    status: programs.status,
    canonicalName: programs.name,
    canonicalGrades: programs.gradeRange,
    canonicalDelivery: programs.deliveryModel,
    programSiteId: programs.siteId,
    organizationId: programs.organizationId,
    siteOrganizationId: sites.organizationId,
  }).from(programPublications)
    .innerJoin(programs, eq(programs.id, programPublications.programId))
    .innerJoin(sites, eq(sites.id, programPublications.siteId))
    .where(and(
      eq(programPublications.siteId, siteId),
      eq(programPublications.status, "published"),
      isNotNull(programPublications.publishedAt),
      inArray(programs.status, ["draft", "launching", "ready", "active"]),
    )).orderBy(asc(programPublications.title))
      // Readers must hold the reviewed marketing snapshot and Program
      // membership stable until the parent Site-publication transaction ends.
      // Otherwise a concurrent unpublish could expose stale approved copy.
      .for("share", { of: [programPublications, programs] }).limit(100);
  const eligible = rows.filter(row => publishableAcademicProgram({
    type: row.type, status: row.status,
    siteId: row.programSiteId,
    organizationId: row.organizationId,
    siteOrganizationId: row.siteOrganizationId,
    publicationSiteId: row.publicationSiteId,
  }) && isCurrentAcademicMarketingSnapshot({
    title: row.title,
    summary: row.summary,
    gradeRange: row.gradeRange,
    deliveryModel: row.deliveryModel,
    programName: row.canonicalName,
    canonicalGrades: row.canonicalGrades,
    canonicalDelivery: row.canonicalDelivery,
  }));
  const listings = [];
  // Deliberately sequential: a caller may already own the transaction.
  for (const row of eligible) {
    // An old published snapshot does NOT outlive a withdrawn CAN–church
    // institutional relationship. Even inquiry marketing must not advertise
    // academic services after independent agreement expiry or revocation.
    try {
      await requireChurchHostedOperatingServices(executor, row.programId,
        ["academic_instruction", "school_of_record"]);
    } catch (error) {
      if (error instanceof AuthorizationError) continue;
      throw error;
    }

    let applicationOpen = false;
    if (row.status === "active") {
      try {
        // Actual applications require additional current admissions service
        // authority. Recheck again at submission/redemption.
        await requireChurchHostedOperatingServices(executor, row.programId,
          ["admissions", "school_of_record"]);
        applicationOpen = true;
      } catch (error) {
        if (!(error instanceof AuthorizationError)) throw error;
      }
    }
    listings.push(publicAcademicProgram({
      programId: row.programId,
      title: row.title,
      summary: row.summary,
      type: row.type,
      status: row.status,
      gradeRange: row.gradeRange,
      deliveryModel: row.deliveryModel,
      applicationOpen,
    }));
  }
  return listings;
}

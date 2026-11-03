import { db } from "@/db/client";
import { projectPublicFamilyServices } from "@/domain/site-family-services";
import { readApprovedPublicSchoolDay } from "@/modules/academic-time/public-school-day.server";

/**
 * Compose reviewed Site family services and the one unambiguous approved
 * academic timetable. The caller MUST first establish an exact authorized
 * Site and obtain published academic Program IDs through
 * readAcademicProgramCatalog. This helper does not authorize publication.
 *
 * With multiple published Programs, the shared parent DTO cannot represent
 * grade-specific day patterns safely. Withhold Site-wide hours rather than
 * flattening or inventing a timetable.
 */
export async function readApprovedPublicParentExtras(
  siteId: string,
  academicProgramIds: readonly string[],
  siteMetadata: Record<string, unknown> | null,
  executor: Pick<typeof db, "select"> = db,
) {
  const schoolDay = academicProgramIds.length === 1
    ? await readApprovedPublicSchoolDay(siteId, academicProgramIds[0]!, executor)
    : undefined;
  return {
    schoolDay,
    services: projectPublicFamilyServices(siteMetadata),
  };
}

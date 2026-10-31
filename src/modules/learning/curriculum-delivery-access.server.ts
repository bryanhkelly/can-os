import { and, eq } from "drizzle-orm";
import {
  courseTemplates, courseTemplateVersions, programs, curriculumAdoptions,
  curriculumEntitlements, curriculumPackItems, curriculumPackVersions,
} from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";

type Reader = Pick<typeof import("@/db/client").db, "select">;

/** Same ownership/adoption rules as class provisioning, rechecked for content
 * delivery. The existing Section version is never repointed or overwritten.
 */
export async function readCurriculumDeliveryAccess(
  query: Reader, section: { programId: string; versionId: string },
): Promise<{ available: boolean; reason: string | null }> {
  const [course] = await query.select({
    organizationId: programs.organizationId,
    providerId: programs.academicProviderOrganizationId,
    ownerId: courseTemplates.owningOrganizationId,
    status: courseTemplateVersions.status,
  }).from(programs)
    .innerJoin(courseTemplateVersions, eq(courseTemplateVersions.id, section.versionId))
    .innerJoin(courseTemplates, eq(courseTemplates.id, courseTemplateVersions.courseTemplateId))
    .where(eq(programs.id, section.programId)).limit(1);
  if (!course || course.status !== "published")
    return { available: false, reason: "The pinned course version is not published." };
  if (course.ownerId === course.organizationId || course.ownerId === course.providerId)
    return { available: true, reason: null };
  const [adoption] = await query.select({ id: curriculumAdoptions.id }).from(curriculumAdoptions)
    .innerJoin(curriculumEntitlements, and(
      eq(curriculumEntitlements.packId, curriculumAdoptions.packId),
      eq(curriculumEntitlements.organizationId, curriculumAdoptions.organizationId),
      eq(curriculumEntitlements.status, "active"),
    ))
    .innerJoin(curriculumPackVersions, and(
      eq(curriculumPackVersions.id, curriculumAdoptions.packVersionId),
      eq(curriculumPackVersions.packId, curriculumAdoptions.packId),
      eq(curriculumPackVersions.status, "published"),
    ))
    .innerJoin(curriculumPackItems, and(
      eq(curriculumPackItems.packVersionId, curriculumPackVersions.id),
      eq(curriculumPackItems.courseTemplateVersionId, section.versionId),
    ))
    .where(and(
      eq(curriculumAdoptions.programId, section.programId),
      eq(curriculumAdoptions.organizationId, course.organizationId),
      eq(curriculumAdoptions.status, "active"),
    )).limit(1);
  return adoption ? { available: true, reason: null } : {
    available: false,
    reason: "This publisher course requires an active institutional license and a published, pinned Program adoption.",
  };
}

export async function requireCurriculumDeliveryAccess(query: Reader, section: { programId: string; versionId: string }) {
  const result = await readCurriculumDeliveryAccess(query, section);
  if (!result.available) throw new AuthorizationError(result.reason!);
}

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  courseTemplates, courseTemplateVersions, curriculumAdoptions,
  curriculumEntitlements, curriculumPackItems, curriculumPackVersions,
} from "@/db/schema";

/**
 * One eligible-course resolver for both the section-setup picker and the
 * authoritative section-creation mutation. A commercial publisher need not
 * be the school's academic provider: active program adoption + organization
 * entitlement + published pack/course are the required additional grants.
 * Returning course ids alone is not an authorization decision.
 */
export async function listLaunchEligibleCourses(program: {
  id: string;
  organizationId: string;
  academicProviderOrganizationId: string | null;
}) {
  const owners = [...new Set([
    program.organizationId, program.academicProviderOrganizationId,
  ].filter((id): id is string => Boolean(id)))];

  const owned = await db.select({
    versionId: courseTemplateVersions.id, version: courseTemplateVersions.version,
    title: courseTemplates.title, code: courseTemplates.code,
    subject: courseTemplates.subject,
  })
    .from(courseTemplateVersions)
    .innerJoin(courseTemplates, eq(courseTemplates.id, courseTemplateVersions.courseTemplateId))
    .where(and(
      eq(courseTemplateVersions.status, "published"),
      inArray(courseTemplates.owningOrganizationId, owners),
    ));

  const adopted = await db.select({
    versionId: courseTemplateVersions.id, version: courseTemplateVersions.version,
    title: courseTemplates.title, code: courseTemplates.code,
    subject: courseTemplates.subject,
  })
    .from(curriculumAdoptions)
    .innerJoin(curriculumEntitlements, and(
      eq(curriculumEntitlements.organizationId, curriculumAdoptions.organizationId),
      eq(curriculumEntitlements.packId, curriculumAdoptions.packId),
      eq(curriculumEntitlements.status, "active"),
    ))
    .innerJoin(curriculumPackVersions, and(
      eq(curriculumPackVersions.id, curriculumAdoptions.packVersionId),
      eq(curriculumPackVersions.packId, curriculumAdoptions.packId),
      eq(curriculumPackVersions.status, "published"),
    ))
    .innerJoin(curriculumPackItems, eq(curriculumPackItems.packVersionId, curriculumPackVersions.id))
    .innerJoin(courseTemplateVersions, and(
      eq(courseTemplateVersions.id, curriculumPackItems.courseTemplateVersionId),
      eq(courseTemplateVersions.status, "published"),
    ))
    .innerJoin(courseTemplates, eq(courseTemplates.id, courseTemplateVersions.courseTemplateId))
    .where(and(
      eq(curriculumAdoptions.programId, program.id),
      eq(curriculumAdoptions.organizationId, program.organizationId),
      eq(curriculumAdoptions.status, "active"),
    ));

  // A version may also be owned by the school or appear in more than one pack;
  // never show duplicate options in the class setup catalog.
  const deduplicated = new Map(owned.map(course => [course.versionId, course]));
  for (const course of adopted) deduplicated.set(course.versionId, course);
  return [...deduplicated.values()].sort((a, b) =>
    a.title.localeCompare(b.title) || a.version - b.version || a.versionId.localeCompare(b.versionId));
}

/** Keep the section-creation authorization exactly aligned with the picker. */
export async function assertLaunchEligibleCourse(program: Parameters<typeof listLaunchEligibleCourses>[0], versionId: string) {
  const courses = await listLaunchEligibleCourses(program);
  if (!courses.some(course => course.versionId === versionId)) {
    throw new Error("Choose a published course owned by your institution or covered by an active program adoption and license.");
  }
}

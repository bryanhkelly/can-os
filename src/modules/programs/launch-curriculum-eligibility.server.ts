import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { licenseValidForYear } from "@/domain/curriculum-year-policy";
import { recommendCourseOption } from "@/domain/first-classroom";
import {
  courseTemplates, courseTemplateVersions, curriculumAnnualAdoptions, schoolYears,
  curriculumEntitlements, curriculumPackItems, curriculumPackVersions, curriculumPacks, organizations, programs,
} from "@/db/schema";

/**
 * One eligible-course resolver for both the section-setup picker and the
 * authoritative section-creation mutation. A commercial publisher need not
 * be the school's academic provider: active program adoption + organization
 * entitlement + published pack/course are the required additional grants.
 * Returning course ids alone is not an authorization decision.
 */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function listLaunchEligibleCourses(program: {
  id: string;
  organizationId: string;
  academicProviderOrganizationId: string | null;
  siteId?: string | null;
  schoolYearId?: string | null;
}, query: Pick<Transaction, "select"> = db) {
  const owners = [...new Set([
    program.organizationId, program.academicProviderOrganizationId,
  ].filter((id): id is string => Boolean(id)))];

  const owned = await query.select({
    versionId: courseTemplateVersions.id, version: courseTemplateVersions.version,
    title: courseTemplates.title, code: courseTemplates.code,
    subject: courseTemplates.subject, curriculum: courseTemplateVersions.curriculum,
  })
    .from(courseTemplateVersions)
    .innerJoin(courseTemplates, eq(courseTemplates.id, courseTemplateVersions.courseTemplateId))
    .where(and(
      eq(courseTemplateVersions.status, "published"),
      inArray(courseTemplates.owningOrganizationId, owners),
    ));

  // Fail closed: publisher content requires an explicit, canonical annual grant.
  const [actualProgram] = await query.select().from(programs).where(eq(programs.id, program.id)).limit(1);
  const yearId = program.schoolYearId;
  const [year] = actualProgram?.siteId && yearId
    ? await query.select().from(schoolYears).where(and(
        eq(schoolYears.id, yearId), eq(schoolYears.organizationId, actualProgram.organizationId),
        eq(schoolYears.siteId, actualProgram.siteId))).limit(1)
    : [];
  const validYear = Boolean(actualProgram && year &&
    actualProgram.organizationId === program.organizationId &&
    actualProgram.academicProviderOrganizationId === program.academicProviderOrganizationId &&
    (year!.programId === null || year!.programId === program.id));
  const adopted = await query.select({
    versionId: courseTemplateVersions.id, version: courseTemplateVersions.version,
    title: courseTemplates.title, code: courseTemplates.code,
    subject: courseTemplates.subject, curriculum: courseTemplateVersions.curriculum,
    packName:curriculumPacks.name,publisherName:organizations.name,
    licenseStatus:curriculumEntitlements.status,licenseMetadata:curriculumEntitlements.metadata,
    adoptionStatus:curriculumAnnualAdoptions.status,supersededAt:curriculumAnnualAdoptions.supersededAt,
    adoptionSiteId:curriculumAnnualAdoptions.siteId,
  })
    .from(curriculumAnnualAdoptions)
    .innerJoin(curriculumEntitlements, and(
      eq(curriculumEntitlements.id, curriculumAnnualAdoptions.entitlementId),
      eq(curriculumEntitlements.organizationId, curriculumAnnualAdoptions.organizationId),
      eq(curriculumEntitlements.packId, curriculumAnnualAdoptions.packId),
      eq(curriculumEntitlements.status, "active"),
    ))
    .innerJoin(curriculumPackVersions, and(
      eq(curriculumPackVersions.id, curriculumAnnualAdoptions.packVersionId),
      eq(curriculumPackVersions.packId, curriculumAnnualAdoptions.packId),
      eq(curriculumPackVersions.status, "published"),
    ))
    .innerJoin(curriculumPacks,eq(curriculumPacks.id,curriculumPackVersions.packId))
    .innerJoin(organizations,eq(organizations.id,curriculumPacks.publisherOrganizationId))
    .innerJoin(curriculumPackItems, eq(curriculumPackItems.packVersionId, curriculumPackVersions.id))
    .innerJoin(courseTemplateVersions, and(
      eq(courseTemplateVersions.id, curriculumPackItems.courseTemplateVersionId),
      eq(courseTemplateVersions.status, "published"),
    ))
    .innerJoin(courseTemplates, eq(courseTemplates.id, courseTemplateVersions.courseTemplateId))
    .where(and(
      eq(curriculumAnnualAdoptions.programId, program.id),
      eq(curriculumAnnualAdoptions.organizationId, program.organizationId),
      eq(curriculumAnnualAdoptions.status, "active"),
      eq(curriculumAnnualAdoptions.academicYearId, yearId ?? "00000000-0000-0000-0000-000000000000"),
      eq(curriculumAnnualAdoptions.siteId, actualProgram?.siteId ?? "00000000-0000-0000-0000-000000000000"),
      eq(curriculumAnnualAdoptions.academicProviderOrganizationId, actualProgram?.academicProviderOrganizationId ?? "00000000-0000-0000-0000-000000000000"),
    ));

  // A version may also be owned by the school or appear in more than one pack;
  // never show duplicate options in the class setup catalog.
  type CourseChoice = (typeof owned)[number] & {
    origin:"institution_owned"|"adopted";packName:string|null;publisherName:string|null;
  };
  const deduplicated = new Map<string,CourseChoice>(owned.map(course => [
    course.versionId,{...course,origin:"institution_owned" as const,packName:null,publisherName:null},
  ]));
  const date=(value:unknown):Date|null=>typeof value==="string" && !Number.isNaN(Date.parse(value)) ? new Date(value):null;
  const startsAt=year?date(year.startsOn):null;
  const endsAt=year?date(year.endsOn):null;
  for (const course of (validYear && startsAt && endsAt ? adopted : [])) {
    const metadata=course.licenseMetadata;
    const licenseStart=date(metadata.licenseStartsAt),licenseEnd=date(metadata.licenseEndsAt);
    if(!licenseStart || !licenseEnd || course.adoptionSiteId!==actualProgram?.siteId || course.supersededAt || course.adoptionStatus!=="active" ||
       !licenseValidForYear({organizationId:program.organizationId,packId:"",publisherOrganizationId:"",
         status:course.licenseStatus,startsAt:licenseStart,endsAt:licenseEnd,
         withdrawnAt:date(metadata.withdrawnAt)}, {startsAt:startsAt!,endsAt:endsAt!},new Date()))continue;
    const {licenseMetadata,licenseStatus,adoptionStatus,supersededAt,adoptionSiteId,...choice}=course;
    deduplicated.set(choice.versionId,{...choice,origin:"adopted"});
  }
  return [...deduplicated.values()].sort((a, b) =>
    a.title.localeCompare(b.title) || a.version - b.version || a.versionId.localeCompare(b.versionId))
    .map(({ curriculum, ...course }) => ({
      ...course,
      recommendation: recommendCourseOption({
        origin: course.origin,
        published: true,
        licenseActive: course.origin === "institution_owned" || course.origin === "adopted",
        adoptionActive: course.origin === "institution_owned" || course.origin === "adopted",
        curriculum,
      }),
    }));
}

/** Keep the section-creation authorization exactly aligned with the picker. */
export async function assertLaunchEligibleCourse(program: Parameters<typeof listLaunchEligibleCourses>[0], versionId: string, query: Pick<Transaction, "select"> = db) {
  const courses = await listLaunchEligibleCourses(program, query);
  if (!courses.some(course => course.versionId === versionId)) {
    throw new Error("Choose a published course owned by your institution or covered by an active program adoption and license.");
  }
}

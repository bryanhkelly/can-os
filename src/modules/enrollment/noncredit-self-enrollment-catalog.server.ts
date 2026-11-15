import { and, count, eq, exists, gt, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  canonicalEnrollmentOrganizations, canonicalEnrollmentSites,
  canonicalOfferingCourses, courseVersions, courses, deploymentOfferingAdoptions,
  educationOperationOrganizationRoles, educationOperations,
  noncreditCompletionPolicies, noncreditSelfEnrollmentClaims,
  noncreditSelfEnrollmentReleases, noncreditTrainingVersions, offeringVersions,
  offerings, programDeployments, classroomDeploymentSites,
} from "@/db/canonical-v301";
import { publishedNoncreditConsentHash } from "@/domain/noncredit-self-enrollment";

type Executor = Pick<typeof db, "select">;

/**
 * Only approved, currently open, policy-backed noncredit releases are discoverable.
 * No draft Course, speculative deployment, unreleased Organization or private
 * participant identity enters the public result. Site is optional for online.
 */
export async function readEligibleSelfEnrollmentReleases(
  executor: Executor = db,
  releaseId?: string,
) {
  const now = new Date();
  const r = noncreditSelfEnrollmentReleases;
  const policy = noncreditCompletionPolicies;
  const operator = educationOperationOrganizationRoles;
  const rows = await executor.select({
    id:r.id, title:noncreditTrainingVersions.title,
    requiredMinutes:noncreditTrainingVersions.requiredInstructionMinutes,
    deploymentId:r.deploymentId, deploymentName:programDeployments.name,
    adoptionId:r.adoptionId, offeringVersionId:r.offeringVersionId,
    trainingVersionId:r.trainingVersionId, courseVersionId:r.courseVersionId,
    providerOrganizationId:r.providerOrganizationId,
    registeringOrganizationId:r.registeringOrganizationId,
    organizationName:canonicalEnrollmentOrganizations.displayName,
    siteId:r.siteId, siteName:canonicalEnrollmentSites.name,
    siteStatus:canonicalEnrollmentSites.status,
    deliveryMode:r.deliveryMode,
    consentText:r.consentText, consentVersion:r.consentVersion,
    opensAt:r.opensAt, closesAt:r.closesAt, maxParticipants:r.maxParticipants,
  }).from(r)
    .innerJoin(programDeployments,eq(programDeployments.id,r.deploymentId))
    .innerJoin(educationOperations,eq(educationOperations.id,programDeployments.operationId))
    .innerJoin(deploymentOfferingAdoptions,and(
      eq(deploymentOfferingAdoptions.id,r.adoptionId),
      eq(deploymentOfferingAdoptions.deploymentId,r.deploymentId),
      eq(deploymentOfferingAdoptions.offeringVersionId,r.offeringVersionId),
    ))
    .innerJoin(offeringVersions,eq(offeringVersions.id,r.offeringVersionId))
    .innerJoin(offerings,eq(offerings.id,offeringVersions.offeringId))
    .innerJoin(noncreditTrainingVersions,and(
      eq(noncreditTrainingVersions.id,r.trainingVersionId),
      eq(noncreditTrainingVersions.offeringVersionId,r.offeringVersionId),
      eq(noncreditTrainingVersions.providerOrganizationId,r.providerOrganizationId),
    ))
    .innerJoin(canonicalEnrollmentOrganizations,eq(canonicalEnrollmentOrganizations.id,r.providerOrganizationId))
    .innerJoin(courseVersions,eq(courseVersions.id,r.courseVersionId))
    .innerJoin(canonicalOfferingCourses,and(
      eq(canonicalOfferingCourses.offeringVersionId,r.offeringVersionId),
      eq(canonicalOfferingCourses.courseVersionId,r.courseVersionId),
    ))
    .innerJoin(courses,eq(courses.id,courseVersions.courseId))
    .leftJoin(canonicalEnrollmentSites,eq(canonicalEnrollmentSites.id,r.siteId))
    .where(and(
      releaseId?eq(r.id,releaseId):undefined,
      eq(r.status,"published"),lte(r.opensAt,now),gt(r.closesAt,now),
      eq(programDeployments.offeringId,offerings.id),
      inArray(programDeployments.status,["authorized","active"]),
      eq(educationOperations.status,"active"),
      eq(offerings.status,"active"),
      eq(offeringVersions.lifecycle,"published"),
      isNotNull(offeringVersions.publishedAt),
      eq(deploymentOfferingAdoptions.approvalStatus,"approved"),
      lte(deploymentOfferingAdoptions.validFrom,now),
      or(isNull(deploymentOfferingAdoptions.validThrough),gt(deploymentOfferingAdoptions.validThrough,now)),
      eq(noncreditTrainingVersions.state,"published"),
      isNotNull(noncreditTrainingVersions.publishedAt),
      isNotNull(noncreditTrainingVersions.approvedByPersonId),
      eq(canonicalEnrollmentOrganizations.status,"active"),
      eq(courseVersions.lifecycle,"published"),isNotNull(courseVersions.publishedAt),
      exists(executor.select({id:policy.id}).from(policy).where(and(
        eq(policy.trainingVersionId,r.trainingVersionId),
        lte(policy.effectiveAt,now),lte(policy.publishedAt,now),
      ))),
      exists(executor.select({id:operator.id}).from(operator).where(and(
        eq(operator.operationId,programDeployments.operationId),
        eq(operator.organizationId,r.registeringOrganizationId),
        eq(operator.roleCode,"operator"),eq(operator.status,"approved"),
        lte(operator.validFrom,now),
        or(isNull(operator.validThrough),gt(operator.validThrough,now)),
      ))),
      or(
        and(eq(r.deliveryMode,"independent"),isNull(r.siteId)),
        and(eq(r.deliveryMode,"facilitated"),isNotNull(r.siteId),
          eq(canonicalEnrollmentSites.status,"active"),
          exists(executor.select({id:classroomDeploymentSites.id})
            .from(classroomDeploymentSites).where(and(
              eq(classroomDeploymentSites.deploymentId,r.deploymentId),
              eq(classroomDeploymentSites.siteId,r.siteId),
            ))),
        ),
      ),
    )).orderBy(r.closesAt,r.id).limit(releaseId?1:100);
  const counts = rows.length?await executor.select({
    releaseId:noncreditSelfEnrollmentClaims.releaseId,participants:count(),
  }).from(noncreditSelfEnrollmentClaims).where(inArray(
    noncreditSelfEnrollmentClaims.releaseId,rows.map(row=>row.id),
  )).groupBy(noncreditSelfEnrollmentClaims.releaseId):[];
  const byRelease = new Map(counts.map(row=>[row.releaseId,Number(row.participants)]));
  return rows.map(row=>({
    ...row,
    seatsRemaining:Math.max(0,row.maxParticipants-(byRelease.get(row.id)??0)),
    consentSha256:publishedNoncreditConsentHash(row.consentVersion,row.consentText),
  }));
}

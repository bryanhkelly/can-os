import { and, eq, isNotNull, lte, or, gt, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  canonicalClasses, programDeployments, educationOperations, deploymentOfferingAdoptions, offeringVersions, offerings, canonicalOfferingCourses,
  courseVersions, courses, educationOperationOrganizationRoles, catalogSites, siteOrganizationRoles, educationOperationSites, classroomDeploymentSites,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Canonical Class active publication, operation, Site and placement authority.
 * Kept server-only so imported RPC entrypoints cannot expose the query. */
export async function currentClassAuthority(tx:Tx,classId:string,now:Date){
  const [r]=await tx.select({
    classId:canonicalClasses.id,classTitle:canonicalClasses.title,
    classCapacity:canonicalClasses.capacity,
    classState:canonicalClasses.state,
    deploymentId:canonicalClasses.deploymentId,adoptionId:canonicalClasses.adoptionId,
    offeringVersionId:canonicalClasses.offeringVersionId,
    courseVersionId:canonicalClasses.courseVersionId,
    siteId:canonicalClasses.siteId,deliveryMode:canonicalClasses.deliveryMode,
    operatingOrganizationId:canonicalClasses.operatingOrganizationId,
  }).from(canonicalClasses)
    .innerJoin(programDeployments,eq(programDeployments.id,canonicalClasses.deploymentId))
    .innerJoin(educationOperations,eq(educationOperations.id,programDeployments.operationId))
    .innerJoin(deploymentOfferingAdoptions,and(
      eq(deploymentOfferingAdoptions.id,canonicalClasses.adoptionId),
      eq(deploymentOfferingAdoptions.deploymentId,canonicalClasses.deploymentId),
      eq(deploymentOfferingAdoptions.offeringVersionId,canonicalClasses.offeringVersionId),
    ))
    .innerJoin(offeringVersions,and(
      eq(offeringVersions.id,canonicalClasses.offeringVersionId),
      eq(offeringVersions.offeringId,programDeployments.offeringId),
    ))
    .innerJoin(offerings,eq(offerings.id,offeringVersions.offeringId))
    .innerJoin(canonicalOfferingCourses,and(
      eq(canonicalOfferingCourses.offeringVersionId,canonicalClasses.offeringVersionId),
      eq(canonicalOfferingCourses.courseVersionId,canonicalClasses.courseVersionId),
    ))
    .innerJoin(courseVersions,eq(courseVersions.id,canonicalClasses.courseVersionId))
    .innerJoin(courses,eq(courses.id,courseVersions.courseId))
    .where(and(
      eq(canonicalClasses.id,classId),eq(programDeployments.status,"active"),
      eq(educationOperations.status,"active"),eq(offerings.status,"active"),
      eq(offeringVersions.lifecycle,"published"),isNotNull(offeringVersions.publishedAt),
      eq(courseVersions.lifecycle,"published"),isNotNull(courseVersions.publishedAt),
      eq(deploymentOfferingAdoptions.approvalStatus,"approved"),
      lte(deploymentOfferingAdoptions.validFrom,now),
      or(isNull(deploymentOfferingAdoptions.validThrough),gt(deploymentOfferingAdoptions.validThrough,now)),
    )).limit(1);
  if(!r || r.classState!=="active")throw new AuthorizationError("currently authorized Class");
  if(!r.siteId)throw new AuthorizationError("active Class must have an authorized Site");
  const [operator]=await tx.select({id:educationOperationOrganizationRoles.id})
    .from(educationOperationOrganizationRoles)
    .innerJoin(programDeployments,eq(programDeployments.operationId,educationOperationOrganizationRoles.operationId))
    .where(and(
      eq(programDeployments.id,r.deploymentId),
      eq(educationOperationOrganizationRoles.organizationId,r.operatingOrganizationId),
      eq(educationOperationOrganizationRoles.roleCode,"operator"),
      eq(educationOperationOrganizationRoles.status,"approved"),
      lte(educationOperationOrganizationRoles.validFrom,now),
      or(isNull(educationOperationOrganizationRoles.validThrough),
        gt(educationOperationOrganizationRoles.validThrough,now)),
    )).limit(1);
  if(!operator)throw new AuthorizationError("current operating organization authority");
  if(r.siteId){
    const [site]=await tx.select({id:catalogSites.id}).from(catalogSites)
      .innerJoin(programDeployments,eq(programDeployments.id,r.deploymentId))
      .innerJoin(siteOrganizationRoles,and(
        eq(siteOrganizationRoles.siteId,catalogSites.id),
        eq(siteOrganizationRoles.organizationId,r.operatingOrganizationId),
        inArray(siteOrganizationRoles.roleCode,["operator","host"]),
        lte(siteOrganizationRoles.validFrom,now),
        or(isNull(siteOrganizationRoles.validThrough),gt(siteOrganizationRoles.validThrough,now)),
      ))
      .innerJoin(educationOperationSites,and(
        eq(educationOperationSites.siteId,catalogSites.id),
        eq(educationOperationSites.operationId,programDeployments.operationId),
        lte(educationOperationSites.validFrom,now),
        or(isNull(educationOperationSites.validThrough),gt(educationOperationSites.validThrough,now)),
      ))
      .where(and(eq(catalogSites.id,r.siteId),eq(catalogSites.status,"active"))).limit(1);
    if(!site)throw new AuthorizationError("active Class Site and Operation relationship");
    if(r.deliveryMode!=="self_paced"){
      const [placement]=await tx.select({id:classroomDeploymentSites.id})
        .from(classroomDeploymentSites).where(and(
          eq(classroomDeploymentSites.deploymentId,r.deploymentId),
          eq(classroomDeploymentSites.siteId,r.siteId),
        )).limit(1);
      if(!placement)throw new AuthorizationError("active deployment Site placement");
    }
  }
  return r;
}

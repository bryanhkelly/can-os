import { and, eq, gt, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  canonicalOfferingCourses, courseVersions, courses, deploymentOfferingAdoptions, offeringVersions, offerings, programDeployments,
  educationOperations, educationOperationOrganizationRoles, educationOperationSites, siteOrganizationRoles, catalogSites, classroomDeploymentSites,
} from "@/db/canonical-v301";
import { classDefinitionSchema } from "@/domain/unified-class";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type ClassOperator={actor:CommandContext;organizationId:string;siteIds:string[]};

/** Live Course adoption, operator authority, and exact Site placement guard.
 * Invoked only from the server-owned mutation and workspace handlers. */
export async function validateClassAuthority(tx: Tx, operator: ClassOperator, input: ReturnType<typeof classDefinitionSchema.parse>) {
  if (input.operatingOrganizationId !== operator.organizationId) {
    throw new AuthorizationError("current operating Organization");
  }
  if (input.siteId && !operator.siteIds.includes(input.siteId)) {
    throw new AuthorizationError("current Site operator scope");
  }
  if (!input.siteId && input.deliveryMode !== "self_paced") {
    throw new AuthorizationError("scheduled and facilitated Classes require an authorized Site");
  }
  const now = new Date();
  const [catalog] = await tx.select({
    courseVersionId: courseVersions.id,
    courseTitle: courses.title,
    operationId: programDeployments.operationId,
  }).from(programDeployments)
    .innerJoin(educationOperations, eq(educationOperations.id,programDeployments.operationId))
    .innerJoin(deploymentOfferingAdoptions, and(
      eq(deploymentOfferingAdoptions.id,input.adoptionId),
      eq(deploymentOfferingAdoptions.deploymentId,programDeployments.id),
      eq(deploymentOfferingAdoptions.offeringVersionId,input.offeringVersionId),
    ))
    .innerJoin(offeringVersions, and(
      eq(offeringVersions.id,input.offeringVersionId),
      eq(offeringVersions.offeringId,programDeployments.offeringId),
    ))
    .innerJoin(offerings, eq(offerings.id,offeringVersions.offeringId))
    .innerJoin(canonicalOfferingCourses,eq(canonicalOfferingCourses.offeringVersionId,offeringVersions.id))
    .innerJoin(courseVersions,eq(courseVersions.id,canonicalOfferingCourses.courseVersionId))
    .innerJoin(courses,eq(courses.id,courseVersions.courseId))
    .where(and(
      eq(programDeployments.id,input.deploymentId),
      eq(programDeployments.status,"active"),
      eq(educationOperations.status,"active"),
      eq(offerings.status,"active"),
      eq(offeringVersions.lifecycle,"published"),isNotNull(offeringVersions.publishedAt),
      eq(courseVersions.id,input.courseVersionId),
      eq(courseVersions.lifecycle,"published"),isNotNull(courseVersions.publishedAt),
      eq(deploymentOfferingAdoptions.approvalStatus,"approved"),
      lte(deploymentOfferingAdoptions.validFrom,now),
      or(isNull(deploymentOfferingAdoptions.validThrough),gt(deploymentOfferingAdoptions.validThrough,now)),
    )).limit(1);
  if (!catalog) throw new AuthorizationError("currently published Course under approved Deployment/adoption");

  const [operatorRole] = await tx.select({id:educationOperationOrganizationRoles.id})
    .from(educationOperationOrganizationRoles).where(and(
      eq(educationOperationOrganizationRoles.operationId,catalog.operationId),
      eq(educationOperationOrganizationRoles.organizationId,operator.organizationId),
      eq(educationOperationOrganizationRoles.roleCode,"operator"),
      eq(educationOperationOrganizationRoles.status,"approved"),
      lte(educationOperationOrganizationRoles.validFrom,now),
      or(isNull(educationOperationOrganizationRoles.validThrough),
        gt(educationOperationOrganizationRoles.validThrough,now)),
    )).limit(1);
  if (!operatorRole) throw new AuthorizationError("current authorized Operation operator");

  if (input.siteId) {
    const [site] = await tx.select({id:catalogSites.id}).from(catalogSites)
      .innerJoin(educationOperationSites,and(
        eq(educationOperationSites.siteId,catalogSites.id),
        eq(educationOperationSites.operationId,catalog.operationId),
        lte(educationOperationSites.validFrom,now),
        or(isNull(educationOperationSites.validThrough),gt(educationOperationSites.validThrough,now)),
      ))
      .innerJoin(siteOrganizationRoles,and(
        eq(siteOrganizationRoles.siteId,catalogSites.id),
        eq(siteOrganizationRoles.organizationId,operator.organizationId),
        inArray(siteOrganizationRoles.roleCode,["operator","host"]),
        lte(siteOrganizationRoles.validFrom,now),
        or(isNull(siteOrganizationRoles.validThrough),gt(siteOrganizationRoles.validThrough,now)),
      ))
      .where(and(eq(catalogSites.id,input.siteId),eq(catalogSites.status,"active")))
      .limit(1);
    if (!site) throw new AuthorizationError("currently authorized Class Site");
    if (["facilitated","hybrid","scheduled"].includes(input.deliveryMode)) {
      const [placement] = await tx.select({id:classroomDeploymentSites.id})
        .from(classroomDeploymentSites).where(and(
          eq(classroomDeploymentSites.deploymentId,input.deploymentId),
          eq(classroomDeploymentSites.siteId,input.siteId),
        )).limit(1);
      if (!placement) throw new AuthorizationError("current Deployment/Site placement");
    }
  }
  return catalog;
}

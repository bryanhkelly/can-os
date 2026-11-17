import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, desc, eq, exists, gt, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalOfferingCourses, catalogSites, courseVersions, courses,
  deploymentOfferingAdoptions, educationOperationOrganizationRoles,
  educationOperationSites, educationOperations, offeringVersions, offerings,
  programDeployments, siteOrganizationRoles,
} from "@/db/canonical-v301";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { publishedOfferingKind, assertCompletePortableCourseComposition } from "@/domain/network-program-rollout";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";

const inputSchema=z.object({
  deploymentId:z.string().uuid(),
  adoptionId:z.string().uuid(),
  offeringVersionId:z.string().uuid(),
}).strict();

/**
 * Publisher-authored product composition under a current local operator grant.
 * Unlike the bounded Course picker, this refuses to export an incomplete
 * multi-Course Offering. Exporting a recipe never creates a Deployment,
 * changes adoption, grants access or publishes content.
 *
 * This is an administrative read, not a learner catalogue or enrollment API.
 */
export const getPublisherRolloutTemplate=createServerFn({method:"GET"})
  .validator((raw:unknown)=>inputSchema.parse(raw))
  .handler(async({data})=>{
    if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true")
      throw new AuthorizationError("unified Class release not activated");
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCanonicalCommandContext(getRequest());
    if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??""))
      throw new AuthorizationError("authorized local Program operator");
    assertCapability(actor,"class.manage");
    if(actor.scope.organizationIds?.length!==1)
      throw new AuthorizationError("one verified operating Organization");
    const siteIds=actor.scope.siteIds??[];
    if(!siteIds.length)throw new AuthorizationError("verified current operator Site");
    const organizationId=actor.scope.organizationIds[0]!;
    const now=new Date();
    return db.transaction(async tx=>{
      const [approved]=await tx.select({
        offeringId:offerings.id,
        offeringVersionId:offeringVersions.id,
        offeringTitle:offerings.title,
        productDefinition:offeringVersions.productDefinition,
        offeringVersionNo:offeringVersions.versionNo,
      }).from(programDeployments)
        .innerJoin(educationOperations,eq(educationOperations.id,programDeployments.operationId))
        .innerJoin(educationOperationOrganizationRoles,and(
          eq(educationOperationOrganizationRoles.operationId,programDeployments.operationId),
          eq(educationOperationOrganizationRoles.organizationId,organizationId),
          eq(educationOperationOrganizationRoles.roleCode,"operator"),
          eq(educationOperationOrganizationRoles.status,"approved"),
          lte(educationOperationOrganizationRoles.validFrom,now),
          or(isNull(educationOperationOrganizationRoles.validThrough),
            gt(educationOperationOrganizationRoles.validThrough,now)),
        ))
        .innerJoin(deploymentOfferingAdoptions,and(
          eq(deploymentOfferingAdoptions.id,data.adoptionId),
          eq(deploymentOfferingAdoptions.deploymentId,programDeployments.id),
          eq(deploymentOfferingAdoptions.approvalStatus,"approved"),
          lte(deploymentOfferingAdoptions.validFrom,now),
          or(isNull(deploymentOfferingAdoptions.validThrough),
            gt(deploymentOfferingAdoptions.validThrough,now)),
        ))
        .innerJoin(offeringVersions,and(
          eq(offeringVersions.id,data.offeringVersionId),
          eq(offeringVersions.id,deploymentOfferingAdoptions.offeringVersionId),
          eq(offeringVersions.offeringId,programDeployments.offeringId),
        ))
        .innerJoin(offerings,eq(offerings.id,offeringVersions.offeringId))
        .where(and(
          eq(programDeployments.id,data.deploymentId),
          eq(programDeployments.status,"active"),
          eq(educationOperations.status,"active"),
          eq(offerings.status,"active"),
          eq(offeringVersions.lifecycle,"published"),
          isNotNull(offeringVersions.publishedAt),
          exists(tx.select({id:educationOperationSites.id}).from(educationOperationSites)
            .innerJoin(catalogSites,and(
              eq(catalogSites.id,educationOperationSites.siteId),
              eq(catalogSites.status,"active"),
            ))
            .innerJoin(siteOrganizationRoles,and(
              eq(siteOrganizationRoles.siteId,catalogSites.id),
              eq(siteOrganizationRoles.organizationId,organizationId),
              inArray(siteOrganizationRoles.roleCode,["operator","host"]),
              lte(siteOrganizationRoles.validFrom,now),
              or(isNull(siteOrganizationRoles.validThrough),
                gt(siteOrganizationRoles.validThrough,now)),
            ))
            .where(and(
              eq(educationOperationSites.operationId,programDeployments.operationId),
              inArray(educationOperationSites.siteId,siteIds),
              lte(educationOperationSites.validFrom,now),
              or(isNull(educationOperationSites.validThrough),
                gt(educationOperationSites.validThrough,now)),
            ))),
        )).limit(1);
      if(!approved)throw new AuthorizationError("currently approved published Offering adoption");
      // Later publisher versions are never adopted implicitly. A local Class
      // keeps its originally approved immutable Offering/Course version.
      const [latest]=await tx.select({versionNo:offeringVersions.versionNo})
        .from(offeringVersions).where(and(
          eq(offeringVersions.offeringId,approved.offeringId),
          eq(offeringVersions.lifecycle,"published"),
          isNotNull(offeringVersions.publishedAt),
        )).orderBy(desc(offeringVersions.versionNo)).limit(1);
      const rows=await tx.select({
        courseVersionId:courseVersions.id,courseTitle:courses.title,
        isRequired:canonicalOfferingCourses.isRequired,
        sequenceNo:canonicalOfferingCourses.sequenceNo,
        lifecycle:courseVersions.lifecycle,
        publishedAt:courseVersions.publishedAt,
      }).from(canonicalOfferingCourses)
        .innerJoin(courseVersions,eq(courseVersions.id,canonicalOfferingCourses.courseVersionId))
        .innerJoin(courses,eq(courses.id,courseVersions.courseId))
        .where(eq(canonicalOfferingCourses.offeringVersionId,approved.offeringVersionId))
        .orderBy(asc(canonicalOfferingCourses.sequenceNo),asc(courses.title)).limit(51);
      assertCompletePortableCourseComposition(approved.productDefinition,rows);
      return {
        offeringVersionId:approved.offeringVersionId,
        offeringVersionNo:approved.offeringVersionNo,
        latestPublishedVersionNo:latest?.versionNo??approved.offeringVersionNo,
        offeringTitle:approved.offeringTitle,
        offeringKind:publishedOfferingKind(approved.productDefinition),
        compositionScope:"courses_only" as const,
        // Do not expose publisher-only lifecycle or timestamps in shared JSON.
        courses:rows.map(({courseVersionId,courseTitle,isRequired,sequenceNo})=>({
          courseVersionId,courseTitle,isRequired,sequenceNo,
        })),
      };
    });
  });

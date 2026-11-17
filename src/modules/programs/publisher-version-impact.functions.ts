import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, desc, eq, exists, gt, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalClasses, canonicalClassOfferingVersions, canonicalEnrollmentSites,
  catalogSites, classroomDeploymentSites, deploymentOfferingAdoptions,
  educationOperationOrganizationRoles, educationOperationSites,
  educationOperations, offeringVersions, offerings, programDeployments,
  siteOrganizationRoles,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";

const input=z.object({offeringId:z.string().uuid()}).strict();

/**
 * Authorization-aware impact projection. Counts existing local Classes pinned
 * to their exact published Offering versions. No implicit version upgrades.
 * This does not mutate Class, Course, adoption or publisher content.
 */
export const getNativeOfferingVersionImpact=createServerFn({method:"GET"})
  .validator((raw:unknown)=>input.parse(raw))
  .handler(async({data})=>{
    if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true")
      throw new AuthorizationError("unified Class release not activated");
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCanonicalCommandContext(getRequest());
    if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??""))
      throw new AuthorizationError("verified local publisher adoption operator");
    assertCapability(actor,"class.manage");
    const organizations=actor.scope.organizationIds??[];
    const siteIds=actor.scope.siteIds??[];
    if(organizations.length!==1||!siteIds.length)
      throw new AuthorizationError("verified single operating organization and Site");
    const organizationId=organizations[0]!;
    const now=new Date();
    return db.transaction(async tx=>{
      // Do not expose unpublished publisher versions, or let an affiliate
      // inspect a publisher's adoption footprint without its own live grant.
      const approved=await tx.select({
        id:deploymentOfferingAdoptions.id,
        versionId:offeringVersions.id,
        versionNo:offeringVersions.versionNo,
        deploymentId:programDeployments.id,
        operationId:programDeployments.operationId,
        deploymentName:programDeployments.name,
      }).from(programDeployments)
        .innerJoin(educationOperations,eq(educationOperations.id,programDeployments.operationId))
        .innerJoin(deploymentOfferingAdoptions,and(
          eq(deploymentOfferingAdoptions.deploymentId,programDeployments.id),
          eq(deploymentOfferingAdoptions.approvalStatus,"approved"),
          lte(deploymentOfferingAdoptions.validFrom,now),
          or(isNull(deploymentOfferingAdoptions.validThrough),gt(deploymentOfferingAdoptions.validThrough,now)),
        ))
        .innerJoin(offeringVersions,and(
          eq(offeringVersions.id,deploymentOfferingAdoptions.offeringVersionId),
          eq(offeringVersions.offeringId,programDeployments.offeringId),
        ))
        .where(and(
          eq(programDeployments.offeringId,data.offeringId),
          eq(programDeployments.status,"active"),eq(educationOperations.status,"active"),
          eq(offeringVersions.lifecycle,"published"),isNotNull(offeringVersions.publishedAt),
          exists(tx.select({id:educationOperationOrganizationRoles.id})
            .from(educationOperationOrganizationRoles).where(and(
              eq(educationOperationOrganizationRoles.operationId,programDeployments.operationId),
              eq(educationOperationOrganizationRoles.organizationId,organizationId),
              eq(educationOperationOrganizationRoles.roleCode,"operator"),
              eq(educationOperationOrganizationRoles.status,"approved"),
              lte(educationOperationOrganizationRoles.validFrom,now),
              or(isNull(educationOperationOrganizationRoles.validThrough),
                gt(educationOperationOrganizationRoles.validThrough,now)),
            ))),
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
              or(isNull(siteOrganizationRoles.validThrough),gt(siteOrganizationRoles.validThrough,now)),
            ))
            .where(and(
              eq(educationOperationSites.operationId,programDeployments.operationId),
              inArray(educationOperationSites.siteId,siteIds),
              lte(educationOperationSites.validFrom,now),
              or(isNull(educationOperationSites.validThrough),gt(educationOperationSites.validThrough,now)),
            ))),
        ));
      if(!approved.length)throw new AuthorizationError("active Offering adoption and Site operation");
      const deploymentIds=[...new Set(approved.map(row=>row.deploymentId))];
      const operationIds=[...new Set(approved.map(row=>row.operationId))];
      const eligibleSiteRows=await tx.select({
        operationId:educationOperationSites.operationId,
        siteId:catalogSites.id,
        siteName:canonicalEnrollmentSites.name,
      }).from(educationOperationSites)
        .innerJoin(catalogSites,and(
          eq(catalogSites.id,educationOperationSites.siteId),
          eq(catalogSites.status,"active"),
        ))
        .leftJoin(canonicalEnrollmentSites,eq(canonicalEnrollmentSites.id,catalogSites.id))
        .innerJoin(siteOrganizationRoles,and(
          eq(siteOrganizationRoles.siteId,catalogSites.id),
          eq(siteOrganizationRoles.organizationId,organizationId),
          inArray(siteOrganizationRoles.roleCode,["operator","host"]),
          lte(siteOrganizationRoles.validFrom,now),
          or(isNull(siteOrganizationRoles.validThrough),gt(siteOrganizationRoles.validThrough,now)),
        ))
        .where(and(
          inArray(educationOperationSites.operationId,operationIds),
          inArray(educationOperationSites.siteId,siteIds),
          lte(educationOperationSites.validFrom,now),
          or(isNull(educationOperationSites.validThrough),gt(educationOperationSites.validThrough,now)),
        ));
      const eligibleSites=[...new Map(eligibleSiteRows.map(site=>[
        site.operationId+":"+site.siteId,site,
      ])).values()];
      const placementRows=await tx.select({
        deploymentId:classroomDeploymentSites.deploymentId,
        siteId:classroomDeploymentSites.siteId,
      }).from(classroomDeploymentSites).where(and(
        inArray(classroomDeploymentSites.deploymentId,deploymentIds),
        inArray(classroomDeploymentSites.siteId,siteIds),
      ));
      const placementSet=new Set(placementRows.map(row=>row.deploymentId+":"+row.siteId));
      const adoptionSites=approved.flatMap(row=>eligibleSites
        .filter(site=>site.operationId===row.operationId)
        .map(site=>({
          adoptionId:row.id,deploymentId:row.deploymentId,
          offeringVersionId:row.versionId,versionNo:row.versionNo,
          siteId:site.siteId,siteName:site.siteName??"Authorized Site",
          classroomPlacement:placementSet.has(row.deploymentId+":"+site.siteId),
        })));
      const [offering]=await tx.select({title:offerings.title,status:offerings.status})
        .from(offerings).where(eq(offerings.id,data.offeringId)).limit(1);
      if(!offering||offering.status!=="active")
        throw new AuthorizationError("active publisher Offering");
      const versions=await tx.select({
        id:offeringVersions.id,versionNo:offeringVersions.versionNo,
      }).from(offeringVersions).where(and(
        eq(offeringVersions.offeringId,data.offeringId),
        eq(offeringVersions.lifecycle,"published"),
        isNotNull(offeringVersions.publishedAt),
      )).orderBy(desc(offeringVersions.versionNo)).limit(100);
      const [other]=await tx.select({versionId:offeringVersions.id})
        .from(offeringVersions).where(and(
          eq(offeringVersions.offeringId,data.offeringId),
          eq(offeringVersions.lifecycle,"published"),
          isNotNull(offeringVersions.publishedAt),
        )).orderBy(desc(offeringVersions.versionNo)).offset(100).limit(1);
      // Counts and Class details use each Class's actual Deployment/Operation,
      // not merely any Site ID that happens to be in the staff account grant.
      const scopedClassFilter=and(
        eq(offeringVersions.offeringId,data.offeringId),
        eq(canonicalClasses.operatingOrganizationId,organizationId),
        inArray(canonicalClasses.deploymentId,deploymentIds),
        inArray(canonicalClasses.siteId,siteIds),
        exists(tx.select({id:educationOperationSites.id})
          .from(educationOperationSites)
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
            eq(educationOperationSites.siteId,canonicalClasses.siteId),
            lte(educationOperationSites.validFrom,now),
            or(isNull(educationOperationSites.validThrough),
              gt(educationOperationSites.validThrough,now)),
          ))),
      );
      const impacts=await tx.select({
        offeringVersionId:canonicalClasses.offeringVersionId,
        siteId:canonicalClasses.siteId,
        state:canonicalClasses.state,
        classCount:sql<number>`count(*)::integer`,
      }).from(canonicalClasses)
        .innerJoin(offeringVersions,eq(offeringVersions.id,canonicalClasses.offeringVersionId))
        .innerJoin(programDeployments,eq(programDeployments.id,canonicalClasses.deploymentId))
        .where(scopedClassFilter)
        .groupBy(canonicalClasses.offeringVersionId,canonicalClasses.siteId,canonicalClasses.state);
      const publishedListings=await tx.select({
        offeringVersionId:canonicalClasses.offeringVersionId,
        siteId:canonicalClasses.siteId,
        classCount:sql<number>`count(distinct ${canonicalClasses.id})::integer`,
      }).from(canonicalClasses)
        .innerJoin(offeringVersions,eq(offeringVersions.id,canonicalClasses.offeringVersionId))
        .innerJoin(programDeployments,eq(programDeployments.id,canonicalClasses.deploymentId))
        .innerJoin(canonicalClassOfferingVersions,and(
          eq(canonicalClassOfferingVersions.classId,canonicalClasses.id),
          eq(canonicalClassOfferingVersions.state,"published"),
        ))
        .where(scopedClassFilter)
        .groupBy(canonicalClasses.offeringVersionId,canonicalClasses.siteId);
      const classRows=await tx.select({
        classId:canonicalClasses.id,
        deploymentId:canonicalClasses.deploymentId,
        offeringVersionId:canonicalClasses.offeringVersionId,
        versionNo:offeringVersions.versionNo,
        siteId:canonicalClasses.siteId,
        title:canonicalClasses.title,
        state:canonicalClasses.state,
        deliveryMode:canonicalClasses.deliveryMode,
      }).from(canonicalClasses)
        .innerJoin(offeringVersions,eq(offeringVersions.id,canonicalClasses.offeringVersionId))
        .innerJoin(programDeployments,eq(programDeployments.id,canonicalClasses.deploymentId))
        .where(scopedClassFilter)
        .orderBy(desc(canonicalClasses.createdAt),desc(canonicalClasses.id))
        .limit(101);
      return {
        offeringId:data.offeringId,offeringTitle:offering.title,
        latestPublishedVersionNo:versions[0]?.versionNo??null,
        publisherVersionsTruncated:!!other,
        approvedAdoptions:approved.map(row=>({
          adoptionId:row.id,deploymentId:row.deploymentId,
          deploymentName:row.deploymentName,
          offeringVersionId:row.versionId,versionNo:row.versionNo,
        })),
        adoptionSites,
        publisherVersions:versions,
        // Counts are exact for the current operator's authorized Site IDs;
        // never describe them as all national/affiliate Classes.
        localClassImpact:impacts,
        publishedClassOfferings:publishedListings,
        affectedClasses:classRows.slice(0,100),
        moreAffectedClasses:classRows.length>100,
      };
    });
  });

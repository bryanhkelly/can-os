import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, exists, gt, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents as canonicalAuditEvents,domainEvents as canonicalDomainEvents,
  canonicalEnrollmentOrganizations,canonicalEnrollmentSites,canonicalOfferingCourses,
  classroomDeploymentSites,courseVersions,deploymentOfferingAdoptions,
  educationOperationOrganizationRoles,educationOperationSites,educationOperations,
  noncreditCompletionPolicies,noncreditSelfEnrollmentReleases,
  noncreditTrainingVersions,offeringVersions,offerings,programDeployments,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { noncreditPublishCommand, publishedNoncreditConsentHash } from "@/domain/noncredit-self-enrollment";
import { requireCanonicalLabProvider } from "@/modules/operations/canonical-capability-lab-access.server";

type Executor = Pick<typeof db,"select">;
type Provider = Awaited<ReturnType<typeof requireCanonicalLabProvider>>;

/** Provider's real, currently approved training/deployment/adoption combinations.
 * Listing is NOT the same as a public enrollment release. */
async function listReleaseCandidates(provider:Provider, executor:Executor=db) {
  const now=new Date();
  const org=provider.organizationId, siteIds=provider.siteIds;
  const operator=educationOperationOrganizationRoles;
  const available=await executor.select({
    deploymentId:programDeployments.id,
    deploymentName:programDeployments.name,
    operationId:programDeployments.operationId,
    adoptionId:deploymentOfferingAdoptions.id,
    offeringVersionId:deploymentOfferingAdoptions.offeringVersionId,
    trainingVersionId:noncreditTrainingVersions.id,
    trainingTitle:noncreditTrainingVersions.title,
    courseVersionId:courseVersions.id,
    providerOrganizationId:noncreditTrainingVersions.providerOrganizationId,
    providerName:canonicalEnrollmentOrganizations.displayName,
  }).from(programDeployments)
    .innerJoin(educationOperations,eq(programDeployments.operationId,educationOperations.id))
    .innerJoin(deploymentOfferingAdoptions,eq(deploymentOfferingAdoptions.deploymentId,programDeployments.id))
    .innerJoin(offeringVersions,eq(offeringVersions.id,deploymentOfferingAdoptions.offeringVersionId))
    .innerJoin(offerings,and(eq(offerings.id,offeringVersions.offeringId),
      eq(offerings.id,programDeployments.offeringId)))
    .innerJoin(noncreditTrainingVersions,eq(
      noncreditTrainingVersions.offeringVersionId,offeringVersions.id))
    .innerJoin(canonicalEnrollmentOrganizations,eq(
      canonicalEnrollmentOrganizations.id,noncreditTrainingVersions.providerOrganizationId))
    .innerJoin(canonicalOfferingCourses,eq(canonicalOfferingCourses.offeringVersionId,offeringVersions.id))
    .innerJoin(courseVersions,eq(courseVersions.id,canonicalOfferingCourses.courseVersionId))
    .where(and(
      inArray(programDeployments.status,["authorized","active"]),
      eq(educationOperations.status,"active"),
      eq(offerings.status,"active"),
      eq(offeringVersions.lifecycle,"published"),isNotNull(offeringVersions.publishedAt),
      eq(deploymentOfferingAdoptions.approvalStatus,"approved"),
      lte(deploymentOfferingAdoptions.validFrom,now),
      or(isNull(deploymentOfferingAdoptions.validThrough),gt(deploymentOfferingAdoptions.validThrough,now)),
      eq(noncreditTrainingVersions.state,"published"),
      isNotNull(noncreditTrainingVersions.publishedAt),
      isNotNull(noncreditTrainingVersions.approvedByPersonId),
      eq(canonicalEnrollmentOrganizations.status,"active"),
      eq(courseVersions.lifecycle,"published"),isNotNull(courseVersions.publishedAt),
      exists(executor.select({id:operator.id}).from(operator).where(and(
        eq(operator.operationId,programDeployments.operationId),
        eq(operator.organizationId,org),eq(operator.roleCode,"operator"),
        eq(operator.status,"approved"),lte(operator.validFrom,now),
        or(isNull(operator.validThrough),gt(operator.validThrough,now)),
      ))),
      exists(executor.select({id:educationOperationSites.id}).from(educationOperationSites)
        .where(and(
          eq(educationOperationSites.operationId,programDeployments.operationId),
          inArray(educationOperationSites.siteId,siteIds),
          lte(educationOperationSites.validFrom,now),
          or(isNull(educationOperationSites.validThrough),
            gt(educationOperationSites.validThrough,now)),
        ))),
      exists(executor.select({id:noncreditCompletionPolicies.id})
        .from(noncreditCompletionPolicies).where(and(
          eq(noncreditCompletionPolicies.trainingVersionId,noncreditTrainingVersions.id),
          lte(noncreditCompletionPolicies.publishedAt,now),
          lte(noncreditCompletionPolicies.effectiveAt,now),
        ))),
    )).orderBy(asc(noncreditTrainingVersions.title)).limit(100);
  const sites = available.length?await executor.select({
    deploymentId:classroomDeploymentSites.deploymentId,
    siteId:classroomDeploymentSites.siteId,
    siteName:canonicalEnrollmentSites.name,
  }).from(classroomDeploymentSites)
    .innerJoin(canonicalEnrollmentSites,eq(canonicalEnrollmentSites.id,classroomDeploymentSites.siteId))
    .innerJoin(programDeployments,eq(programDeployments.id,classroomDeploymentSites.deploymentId))
    .innerJoin(educationOperationSites,and(
      eq(educationOperationSites.operationId,programDeployments.operationId),
      eq(educationOperationSites.siteId,classroomDeploymentSites.siteId),
      lte(educationOperationSites.validFrom,now),
      or(isNull(educationOperationSites.validThrough),gt(educationOperationSites.validThrough,now)),
    ))
    .where(and(
      inArray(classroomDeploymentSites.deploymentId,available.map(row=>row.deploymentId)),
      inArray(classroomDeploymentSites.siteId,siteIds),
      eq(canonicalEnrollmentSites.status,"active"),
    )).limit(200):[];
  return available.map(row=>({
    ...row,
    siteOptions:sites.filter(site=>site.deploymentId===row.deploymentId)
      .map(site=>({id:site.siteId,name:site.siteName})),
  }));
}

export const getNoncreditEnrollmentPublisher = createServerFn({method:"GET"})
  .handler(async()=>{
    setResponseHeader("Cache-Control","private, no-store");
    const provider=await requireCanonicalLabProvider();
    const candidates=await listReleaseCandidates(provider);
    const published=await db.select({
      id:noncreditSelfEnrollmentReleases.id,
      deploymentId:noncreditSelfEnrollmentReleases.deploymentId,
      title:noncreditTrainingVersions.title,
      status:noncreditSelfEnrollmentReleases.status,
      deliveryMode:noncreditSelfEnrollmentReleases.deliveryMode,
      siteId:noncreditSelfEnrollmentReleases.siteId,
      opensAt:noncreditSelfEnrollmentReleases.opensAt,
      closesAt:noncreditSelfEnrollmentReleases.closesAt,
      maxParticipants:noncreditSelfEnrollmentReleases.maxParticipants,
    }).from(noncreditSelfEnrollmentReleases)
      .innerJoin(noncreditTrainingVersions,eq(
        noncreditTrainingVersions.id,noncreditSelfEnrollmentReleases.trainingVersionId))
      .where(eq(noncreditSelfEnrollmentReleases.registeringOrganizationId,provider.organizationId))
      .orderBy(noncreditSelfEnrollmentReleases.createdAt).limit(100);
    return {candidates,published};
  });

/** A publisher can only release an independently approved, live adoption
 * through the currently authorized operator organization and its Site. */
export const publishNoncreditSelfEnrollment = createServerFn({method:"POST"})
  .validator((value:unknown)=>noncreditPublishCommand.parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const provider=await requireCanonicalLabProvider();
    const now=new Date();
    if(new Date(data.closesAt)<=now)
      throw new AuthorizationError("Enrollment closing must be in the future");
    return db.transaction(async tx=>{
      const options=await listReleaseCandidates(provider,tx);
      const selected=options.find(row=>
        row.deploymentId===data.deploymentId &&
        row.adoptionId===data.adoptionId &&
        row.trainingVersionId===data.trainingVersionId &&
        row.courseVersionId===data.courseVersionId);
      if(!selected)throw new AuthorizationError("current provider-approved training/adoption");
      if(data.deliveryMode==="facilitated" &&
         !selected.siteOptions.some(option=>option.id===data.siteId))
        throw new AuthorizationError("authorized active Site for facilitated cohort");
      const [release]=await tx.insert(noncreditSelfEnrollmentReleases).values({
        deploymentId:selected.deploymentId,adoptionId:selected.adoptionId,
        trainingVersionId:selected.trainingVersionId,courseVersionId:selected.courseVersionId,
        offeringVersionId:selected.offeringVersionId,
        providerOrganizationId:selected.providerOrganizationId,
        registeringOrganizationId:provider.organizationId,
        siteId:data.deliveryMode==="facilitated"?data.siteId:null,
        deliveryMode:data.deliveryMode,status:"published",
        opensAt:new Date(data.opensAt),closesAt:new Date(data.closesAt),
        maxParticipants:data.maxParticipants,
        consentVersion:data.consentVersion,consentText:data.consentText,
        publishedByPersonId:provider.actor.actorPersonId!,
      }).returning({id:noncreditSelfEnrollmentReleases.id});
      if(!release)throw new Error("Could not publish enrollment");
      await tx.insert(canonicalAuditEvents).values({
        actorPersonId:provider.actor.actorPersonId!,
        owningOrganizationId:provider.organizationId,
        eventCode:"noncredit.self_enrollment.release_published",
        entityKind:"noncredit_self_enrollment_release",entityId:release.id,
        payload:{deliveryMode:data.deliveryMode,siteId:data.siteId,
          maxParticipants:data.maxParticipants,consentVersion:data.consentVersion,
          consentSha256:publishedNoncreditConsentHash(data.consentVersion,data.consentText)},
      });
      await tx.insert(canonicalDomainEvents).values({
        eventType:"NoncreditSelfEnrollmentReleasePublished",
        aggregateType:"noncredit_self_enrollment_release",
        aggregateId:release.id,actorPersonId:provider.actor.actorPersonId!,
        payload:{organizationId:provider.organizationId,siteId:data.siteId},
      });
      return {releaseId:release.id};
    });
  });

export const closeNoncreditSelfEnrollment = createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({releaseId:z.string().uuid()}).strict().parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const provider=await requireCanonicalLabProvider();
    return db.transaction(async tx=>{
      const [release]=await tx.select().from(noncreditSelfEnrollmentReleases)
        .where(and(eq(noncreditSelfEnrollmentReleases.id,data.releaseId),
          eq(noncreditSelfEnrollmentReleases.registeringOrganizationId,provider.organizationId)))
        .for("update").limit(1);
      if(!release)throw new AuthorizationError("provider-owned enrollment release");
      if(release.siteId&&!provider.siteIds.includes(release.siteId))
        throw new AuthorizationError("current facilitator Site");
      if(release.status==="closed")return {closed:true};
      const candidate=(await listReleaseCandidates(provider,tx))
        .find(row=>row.deploymentId===release.deploymentId);
      // If authority was withdrawn, closing must still be possible: current
      // original grant + same Site restricts who can close the release.
      if(!candidate && !release.siteId)
        throw new AuthorizationError("current operator deployment");
      await tx.update(noncreditSelfEnrollmentReleases)
        .set({status:"closed",closedAt:new Date()})
        .where(eq(noncreditSelfEnrollmentReleases.id,release.id));
      await tx.insert(canonicalAuditEvents).values({
        actorPersonId:provider.actor.actorPersonId!,
        owningOrganizationId:provider.organizationId,
        eventCode:"noncredit.self_enrollment.release_closed",
        entityKind:"noncredit_self_enrollment_release",entityId:release.id,
        payload:{closed:true},
      });
      return {closed:true};
    });
  });

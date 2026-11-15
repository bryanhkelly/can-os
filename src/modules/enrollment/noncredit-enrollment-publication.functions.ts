import { alias } from "drizzle-orm/pg-core";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, exists, gt, inArray, isNotNull, isNull, lte, notExists, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents as canonicalAuditEvents,domainEvents as canonicalDomainEvents,
  canonicalEnrollmentOrganizations,canonicalEnrollmentSites,canonicalOfferingCourses,
  classroomDeploymentSites,courseVersions,deploymentOfferingAdoptions,
  educationOperationOrganizationRoles,educationOperationSites,educationOperations,
  operationalAuthorizationDecisions,
  noncreditCompletionPolicies,noncreditSelfEnrollmentReleases,
  noncreditTrainingVersions,offeringVersions,offerings,programDeployments,
  siteOrganizationRoles,
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
  const registeringOrg=alias(canonicalEnrollmentOrganizations,"self_enroll_registering_org");
  const supersedingPermission=alias(operationalAuthorizationDecisions,"self_enroll_permission_superseding");
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
    .innerJoin(registeringOrg,eq(registeringOrg.id,org))
    .innerJoin(canonicalOfferingCourses,eq(canonicalOfferingCourses.offeringVersionId,offeringVersions.id))
    .innerJoin(courseVersions,eq(courseVersions.id,canonicalOfferingCourses.courseVersionId))
    .where(and(
      eq(programDeployments.status,"active"),
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
      eq(registeringOrg.status,"active"),
      eq(courseVersions.lifecycle,"published"),isNotNull(courseVersions.publishedAt),
      exists(executor.select({id:operationalAuthorizationDecisions.id})
        .from(operationalAuthorizationDecisions).where(and(
          eq(operationalAuthorizationDecisions.stageCode,"register_noncredit"),
          eq(operationalAuthorizationDecisions.decision,"approved"),
          eq(operationalAuthorizationDecisions.authorityOrganizationId,org),
          or(eq(operationalAuthorizationDecisions.operationId,programDeployments.operationId),
            eq(operationalAuthorizationDecisions.deploymentId,programDeployments.id)),
          lte(operationalAuthorizationDecisions.validFrom,now),
          or(isNull(operationalAuthorizationDecisions.validThrough),
            gt(operationalAuthorizationDecisions.validThrough,now)),
          notExists(executor.select({id:supersedingPermission.id})
            .from(supersedingPermission)
            .where(eq(supersedingPermission.supersedesId,operationalAuthorizationDecisions.id))),
        ))),
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
      exists(executor.select({id:siteOrganizationRoles.id})
        .from(siteOrganizationRoles).where(and(
          eq(siteOrganizationRoles.siteId,classroomDeploymentSites.siteId),
          eq(siteOrganizationRoles.organizationId,org),
          inArray(siteOrganizationRoles.roleCode,["operator","host"]),
          lte(siteOrganizationRoles.validFrom,now),
          or(isNull(siteOrganizationRoles.validThrough),
            gt(siteOrganizationRoles.validThrough,now)),
        ))),
    )).limit(200):[];
  // Digital/independent Site association does not require a classroom room
  // or in-person facilitator. It still requires the current operation-to-Site
  // relationship and this registering organization's operator/host authority.
  const digitalSites=available.length?await executor.select({
    deploymentId:programDeployments.id,
    siteId:educationOperationSites.siteId,
    siteName:canonicalEnrollmentSites.name,
  }).from(educationOperationSites)
    .innerJoin(programDeployments,eq(programDeployments.operationId,educationOperationSites.operationId))
    .innerJoin(canonicalEnrollmentSites,eq(canonicalEnrollmentSites.id,educationOperationSites.siteId))
    .where(and(
      inArray(programDeployments.id,available.map(row=>row.deploymentId)),
      inArray(educationOperationSites.siteId,siteIds),
      eq(canonicalEnrollmentSites.status,"active"),
      lte(educationOperationSites.validFrom,now),
      or(isNull(educationOperationSites.validThrough),gt(educationOperationSites.validThrough,now)),
      exists(executor.select({id:siteOrganizationRoles.id}).from(siteOrganizationRoles).where(and(
        eq(siteOrganizationRoles.siteId,educationOperationSites.siteId),
        eq(siteOrganizationRoles.organizationId,org),
        inArray(siteOrganizationRoles.roleCode,["operator","host"]),
        lte(siteOrganizationRoles.validFrom,now),
        or(isNull(siteOrganizationRoles.validThrough),gt(siteOrganizationRoles.validThrough,now)),
      ))),
    )).limit(200):[];
  return available.map(row=>({
    ...row,
    siteOptions:sites.filter(site=>site.deploymentId===row.deploymentId)
      .map(site=>({id:site.siteId,name:site.siteName})),
    digitalSiteOptions:digitalSites.filter(site=>site.deploymentId===row.deploymentId)
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
      if(data.deliveryMode==="independent" && data.siteId!==null &&
         !selected.digitalSiteOptions.some(option=>option.id===data.siteId))
        throw new AuthorizationError("authorized Site association for online release");
      const [release]=await tx.insert(noncreditSelfEnrollmentReleases).values({
        deploymentId:selected.deploymentId,adoptionId:selected.adoptionId,
        trainingVersionId:selected.trainingVersionId,courseVersionId:selected.courseVersionId,
        offeringVersionId:selected.offeringVersionId,
        providerOrganizationId:selected.providerOrganizationId,
        registeringOrganizationId:provider.organizationId,
        siteId:data.siteId,
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

/** A current operating organization may publish the SAME approved training
 * at several of its OWN currently authorized deployment Sites. This does
 * not appoint a network role, approve a Site, or authorize a different
 * independent host organization. Each Site keeps its own release, seats
 * and learner records.
 */
const multiSitePublishInput=z.object({
  deploymentId:z.string().uuid(),adoptionId:z.string().uuid(),
  trainingVersionId:z.string().uuid(),courseVersionId:z.string().uuid(),
  siteIds:z.array(z.string().uuid()).min(2).max(50),
  opensAt:z.string().datetime({offset:true}),
  closesAt:z.string().datetime({offset:true}),
  maxParticipants:z.number().int().min(1).max(1000000),
  consentVersion:z.string().trim().min(3).max(80),
  consentText:z.string().trim().min(25).max(4000),
}).strict().refine(x=>new Date(x.opensAt)<new Date(x.closesAt),{
  message:"Registration closing must follow opening",
});

export const publishNoncreditAcrossAuthorizedSites=createServerFn({method:"POST"})
  .validator((v:unknown)=>multiSitePublishInput.parse(v))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const provider=await requireCanonicalLabProvider();
    if(new Date(data.closesAt)<=new Date())
      throw new AuthorizationError("future registration closing");
    const ids=[...new Set(data.siteIds)];
    if(ids.length!==data.siteIds.length)
      throw new AuthorizationError("unique authorized hosting Sites");
    return db.transaction(async tx=>{
      // Serialize equivalent launches from this operating organization.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"noncredit-multisite:"+provider.organizationId+":"+data.deploymentId}))`);
      const candidates=await listReleaseCandidates(provider,tx);
      const selected=candidates.find(row=>
        row.deploymentId===data.deploymentId &&
        row.adoptionId===data.adoptionId &&
        row.trainingVersionId===data.trainingVersionId &&
        row.courseVersionId===data.courseVersionId);
      if(!selected || !ids.every(siteId=>
        selected.siteOptions.some(option=>option.id===siteId)))
        throw new AuthorizationError("approved training at each authorized host Site");
      const released:{siteId:string;releaseId:string;alreadyPublished:boolean}[]=[];
      for(const siteId of ids){
        const existing=await tx.select().from(noncreditSelfEnrollmentReleases)
          .where(and(
            eq(noncreditSelfEnrollmentReleases.registeringOrganizationId,provider.organizationId),
            eq(noncreditSelfEnrollmentReleases.deploymentId,selected.deploymentId),
            eq(noncreditSelfEnrollmentReleases.trainingVersionId,selected.trainingVersionId),
            eq(noncreditSelfEnrollmentReleases.adoptionId,selected.adoptionId),
            eq(noncreditSelfEnrollmentReleases.courseVersionId,selected.courseVersionId),
            eq(noncreditSelfEnrollmentReleases.siteId,siteId),
            eq(noncreditSelfEnrollmentReleases.opensAt,new Date(data.opensAt)),
          )).limit(1);
        if(existing.length){
          const prior=existing[0]!;
          if(prior.closesAt.getTime()!==new Date(data.closesAt).getTime()||
            prior.maxParticipants!==data.maxParticipants||
            prior.consentVersion!==data.consentVersion||
            prior.consentText!==data.consentText||
            prior.status!=="published")
            throw new AuthorizationError("existing cohort differs; close and create a new registration window");
          released.push({siteId,releaseId:prior.id,alreadyPublished:true});
          continue;
        }
        const [row]=await tx.insert(noncreditSelfEnrollmentReleases).values({
          deploymentId:selected.deploymentId,adoptionId:selected.adoptionId,
          trainingVersionId:selected.trainingVersionId,
          courseVersionId:selected.courseVersionId,
          offeringVersionId:selected.offeringVersionId,
          providerOrganizationId:selected.providerOrganizationId,
          registeringOrganizationId:provider.organizationId,
          siteId,deliveryMode:"facilitated",status:"published",
          opensAt:new Date(data.opensAt),closesAt:new Date(data.closesAt),
          maxParticipants:data.maxParticipants,
          consentVersion:data.consentVersion,consentText:data.consentText,
          publishedByPersonId:provider.actor.actorPersonId!,
        }).returning({id:noncreditSelfEnrollmentReleases.id});
        if(!row)throw new Error("Could not publish Site cohort");
        const payload={siteId,releaseId:row.id,
          consentSha256:publishedNoncreditConsentHash(data.consentVersion,data.consentText),
          trainingVersionId:selected.trainingVersionId};
        await tx.insert(canonicalAuditEvents).values({
          actorPersonId:provider.actor.actorPersonId!,
          owningOrganizationId:provider.organizationId,
          eventCode:"noncredit.self_enrollment.site_release_published",
          entityKind:"noncredit_self_enrollment_release",entityId:row.id,payload,
        });
        await tx.insert(canonicalDomainEvents).values({
          eventType:"NoncreditSiteEnrollmentReleasePublished",
          aggregateType:"noncredit_self_enrollment_release",
          aggregateId:row.id,actorPersonId:provider.actor.actorPersonId!,
          payload,
        });
        released.push({siteId,releaseId:row.id,alreadyPublished:false});
      }
      return {releases:released};
    });
  });

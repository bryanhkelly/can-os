import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, canonicalDeliverySessions, classroomDeploymentSites, classroomOfferingCourses, courseVersions, deploymentOfferingAdoptions, domainEvents, facilitatedClassroomPlans, offeringVersions } from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { validClassroomScheduleWindow } from "@/domain/classroom-scheduling";
import { requireCanonicalFacilitator } from "./canonical-facilitator-access.server";
import { authorizedHostDeployment } from "./facilitated-learning-operations.server";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Host=Awaited<ReturnType<typeof requireCanonicalFacilitator>>;
type ScheduleCommand={deploymentId:string;courseVersionId:string;siteId:string;requestId:string;startsAt:string;endsAt:string};

/** Server-owned classroom scheduling and audit operations. Never export these
 * implementations from a browser-imported .functions.ts RPC module. */
export async function approvedSiteCourse(
  tx:Tx,host:Host,deploymentId:string,courseVersionId:string,siteId:string,
) {
  await authorizedHostDeployment(tx,host,deploymentId,siteId);
  const now=new Date();
  const [site]=await tx.select({id:classroomDeploymentSites.id})
    .from(classroomDeploymentSites).where(and(
      eq(classroomDeploymentSites.deploymentId,deploymentId),
      eq(classroomDeploymentSites.siteId,siteId),
    )).limit(1);
  if(!site)throw new AuthorizationError("registered deployment Site for scheduling");
  const [adoption]=await tx.select({id:deploymentOfferingAdoptions.id})
    .from(deploymentOfferingAdoptions)
    .innerJoin(offeringVersions,and(
      eq(offeringVersions.id,deploymentOfferingAdoptions.offeringVersionId),
      eq(offeringVersions.lifecycle,"published"),
    ))
    .innerJoin(classroomOfferingCourses,eq(
      classroomOfferingCourses.offeringVersionId,offeringVersions.id,
    ))
    .innerJoin(courseVersions,and(
      eq(courseVersions.id,classroomOfferingCourses.courseVersionId),
      eq(courseVersions.lifecycle,"published"),
    ))
    .where(and(
      eq(deploymentOfferingAdoptions.deploymentId,deploymentId),
      eq(classroomOfferingCourses.courseVersionId,courseVersionId),
      eq(deploymentOfferingAdoptions.approvalStatus,"approved"),
      lte(deploymentOfferingAdoptions.validFrom,now),
      or(isNull(deploymentOfferingAdoptions.validThrough),
        gt(deploymentOfferingAdoptions.validThrough,now)),
    )).limit(1);
  if(!adoption)throw new AuthorizationError("current approved published classroom Course");
  return site.id;
}
export async function auditPlan(tx:Tx,host:Host,planId:string,event:string,payload:Record<string,string>){
  await tx.insert(auditEvents).values({
    actorPersonId:host.actor.actorPersonId!,
    owningOrganizationId:host.organizationId,
    eventCode:"learning.classroom.plan."+event,
    entityKind:"facilitated_classroom_plan",entityId:planId,
    payload,
  });
  await tx.insert(domainEvents).values({
    actorPersonId:host.actor.actorPersonId!,
    eventType:"ClassroomPlan"+event[0].toUpperCase()+event.slice(1),
    aggregateType:"facilitated_classroom_plan",aggregateId:planId,
    payload,
  });
}
export async function scheduleOneClassroom(tx:Tx,host:Host,data:ScheduleCommand,now:Date){
  const startsAt=new Date(data.startsAt),endsAt=new Date(data.endsAt);
  if(!validClassroomScheduleWindow(startsAt,endsAt,now))
    throw new AuthorizationError("future classroom window between 15 minutes and eight hours");
  const deploymentSiteId=await approvedSiteCourse(
    tx,host,data.deploymentId,data.courseVersionId,data.siteId,
  );
  const [prior]=await tx.select().from(facilitatedClassroomPlans).where(and(
    eq(facilitatedClassroomPlans.hostOrganizationId,host.organizationId),
    eq(facilitatedClassroomPlans.facilitatorPersonId,host.actor.actorPersonId!),
    eq(facilitatedClassroomPlans.requestId,data.requestId),
  )).limit(1);
  if(prior){
    const [delivery]=await tx.select().from(canonicalDeliverySessions)
      .where(eq(canonicalDeliverySessions.id,prior.deliverySessionId)).limit(1);
    if(!delivery || prior.deploymentId!==data.deploymentId ||
      prior.courseVersionId!==data.courseVersionId || prior.siteId!==data.siteId ||
      delivery.startsAt.getTime()!==startsAt.getTime() ||
      delivery.endsAt.getTime()!==endsAt.getTime())
      throw new Error("Conflicting classroom schedule retry");
    return {planId:prior.id,duplicate:true};
  }
  const [delivery]=await tx.insert(canonicalDeliverySessions).values({
    deploymentId:data.deploymentId,deploymentSiteId,siteId:data.siteId,
    startsAt,endsAt,modality:"onsite",modalityVocabularyCode:"delivery_modality",
  }).returning({id:canonicalDeliverySessions.id});
  if(!delivery)throw new Error("Cannot save classroom delivery session");
  const [plan]=await tx.insert(facilitatedClassroomPlans).values({
    deliverySessionId:delivery.id,deploymentId:data.deploymentId,
    courseVersionId:data.courseVersionId,siteId:data.siteId,
    hostOrganizationId:host.organizationId,
    facilitatorPersonId:host.actor.actorPersonId!,
    requestId:data.requestId,
  }).returning({id:facilitatedClassroomPlans.id});
  if(!plan)throw new Error("Cannot save classroom plan");
  await auditPlan(tx,host,plan.id,"scheduled",{
    deploymentId:data.deploymentId,siteId:data.siteId,
    courseVersionId:data.courseVersionId,
    startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString(),
  });
  return {planId:plan.id,duplicate:false};
}

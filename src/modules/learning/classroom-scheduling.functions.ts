import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents, canonicalDeliverySessions, classroomDeploymentSites,
  classroomOfferingCourses, courseVersions, deploymentOfferingAdoptions,
  domainEvents, facilitatedClassroomPlans, offeringVersions,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { requireCanonicalFacilitator } from "./canonical-facilitator-access.server";
import {
  authorizedHostDeployment, createFacilitatedRoomForHost,
} from "./facilitated-learning.functions";
import { requireFacilitatedLearningEnabled } from "./canonical-learning-release.server";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Host=Awaited<ReturnType<typeof requireCanonicalFacilitator>>;
const id=z.string().uuid();
const time=z.string().datetime({offset:true});
const scheduleInput=z.object({
  deploymentId:id,courseVersionId:id,siteId:id,requestId:id,
  startsAt:time,endsAt:time,
}).strict();
const planInput=z.object({planId:id}).strict();
const rescheduleInput=planInput.extend({startsAt:time,endsAt:time}).strict();

export function validateClassroomTimes(start:Date,end:Date,now:Date) {
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||
     start.getTime()<now.getTime()+5*60_000 ||
     start.getTime()>now.getTime()+180*24*60*60_000 ||
     end.getTime()-start.getTime()<15*60_000 ||
     end.getTime()-start.getTime()>8*60*60_000)
    throw new AuthorizationError("future classroom window between 15 minutes and eight hours");
}
function guard(){
  requireFacilitatedLearningEnabled();
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}
async function approvedSiteCourse(
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
async function auditPlan(tx:Tx,host:Host,planId:string,event:string,payload:Record<string,string>){
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
async function ownedPlan(tx:Tx,host:Host,planId:string,lock=false){
  const query=tx.select({
    plan:facilitatedClassroomPlans,delivery:canonicalDeliverySessions,
  }).from(facilitatedClassroomPlans).innerJoin(canonicalDeliverySessions,
    eq(canonicalDeliverySessions.id,facilitatedClassroomPlans.deliverySessionId),
  ).where(and(
    eq(facilitatedClassroomPlans.id,planId),
    eq(facilitatedClassroomPlans.hostOrganizationId,host.organizationId),
    eq(facilitatedClassroomPlans.facilitatorPersonId,host.actor.actorPersonId!),
    inArray(facilitatedClassroomPlans.siteId,host.siteIds),
  )).limit(1);
  const [row]=lock?await query.for("update",{of:facilitatedClassroomPlans}):await query;
  if(!row||row.plan.deploymentId!==row.delivery.deploymentId||
    row.plan.siteId!==row.delivery.siteId)
    throw new AuthorizationError("current owned classroom plan");
  await authorizedHostDeployment(tx,host,row.plan.deploymentId,row.plan.siteId);
  return row;
}
export const getClassroomSchedule=createServerFn({method:"GET"})
  .handler(async()=>{
    guard();
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const rows=await tx.select({
        plan:facilitatedClassroomPlans,delivery:canonicalDeliverySessions,
      }).from(facilitatedClassroomPlans)
        .innerJoin(canonicalDeliverySessions,eq(
          canonicalDeliverySessions.id,facilitatedClassroomPlans.deliverySessionId,
        ))
        .where(and(
          eq(facilitatedClassroomPlans.hostOrganizationId,host.organizationId),
          eq(facilitatedClassroomPlans.facilitatorPersonId,host.actor.actorPersonId!),
          inArray(facilitatedClassroomPlans.siteId,host.siteIds),
          gt(canonicalDeliverySessions.endsAt,new Date(Date.now()-30*24*60*60_000)),
        )).orderBy(asc(canonicalDeliverySessions.startsAt)).limit(101);
      const plans=[];
      for(const row of rows.slice(0,100)){
        try {
          await authorizedHostDeployment(tx,host,row.plan.deploymentId,row.plan.siteId);
        }catch{continue;}
        plans.push({
          id:row.plan.id,deploymentId:row.plan.deploymentId,
          courseVersionId:row.plan.courseVersionId,siteId:row.plan.siteId,
          deliverySessionId:row.plan.deliverySessionId,
          state:row.plan.state,facilitatedSessionId:row.plan.facilitatedSessionId,
          startsAt:row.delivery.startsAt.toISOString(),
          endsAt:row.delivery.endsAt.toISOString(),
        });
      }
      return {plans,partial:rows.length>100,
        note:"A calendar booking is not learner enrollment or verified attendance."};
    });
  });
export const scheduleClassroom=createServerFn({method:"POST"})
  .validator((raw:unknown)=>scheduleInput.parse(raw))
  .handler(async({data})=>{
    guard();
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const startsAt=new Date(data.startsAt),endsAt=new Date(data.endsAt);
      validateClassroomTimes(startsAt,endsAt,new Date());
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
    });
  });
export const rescheduleClassroom=createServerFn({method:"POST"})
  .validator((raw:unknown)=>rescheduleInput.parse(raw))
  .handler(async({data})=>{
    guard();const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const {plan,delivery}=await ownedPlan(tx,host,data.planId,true);
      if(plan.state!=="scheduled")throw new AuthorizationError("reschedule a pending classroom only");
      const startsAt=new Date(data.startsAt),endsAt=new Date(data.endsAt);
      validateClassroomTimes(startsAt,endsAt,new Date());
      await approvedSiteCourse(tx,host,plan.deploymentId,plan.courseVersionId,plan.siteId);
      await tx.update(canonicalDeliverySessions).set({startsAt,endsAt})
        .where(eq(canonicalDeliverySessions.id,delivery.id));
      await tx.update(facilitatedClassroomPlans).set({updatedAt:new Date()})
        .where(eq(facilitatedClassroomPlans.id,plan.id));
      await auditPlan(tx,host,plan.id,"rescheduled",{
        from:delivery.startsAt.toISOString(),to:startsAt.toISOString(),
        end:endsAt.toISOString(),
      });
      return {saved:true};
    });
  });
export const cancelClassroomPlan=createServerFn({method:"POST"})
  .validator((raw:unknown)=>planInput.parse(raw))
  .handler(async({data})=>{
    guard();const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const {plan}=await ownedPlan(tx,host,data.planId,true);
      if(plan.state==="cancelled")return {cancelled:true,alreadyCancelled:true};
      if(plan.state!=="scheduled")throw new AuthorizationError("cannot cancel an already started room");
      await tx.update(facilitatedClassroomPlans).set({
        state:"cancelled",updatedAt:new Date(),
      }).where(eq(facilitatedClassroomPlans.id,plan.id));
      await auditPlan(tx,host,plan.id,"cancelled",{siteId:plan.siteId});
      return {cancelled:true,alreadyCancelled:false};
    });
  });
export const openScheduledClassroom=createServerFn({method:"POST"})
  .validator((raw:unknown)=>planInput.parse(raw))
  .handler(async({data})=>{
    guard();const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const {plan,delivery}=await ownedPlan(tx,host,data.planId,true);
      if(plan.state==="started" && plan.facilitatedSessionId)
        return {facilitatedSessionId:plan.facilitatedSessionId,
          pairingCode:null as string|null,pairingExpiresAt:null as string|null,
          alreadyStarted:true};
      if(plan.state!=="scheduled")throw new AuthorizationError("active scheduled classroom");
      const now=new Date();
      if(now.getTime()<delivery.startsAt.getTime()-15*60_000 ||
         now>=delivery.endsAt)
        throw new AuthorizationError("start within 15 minutes of the scheduled time");
      const created=await createFacilitatedRoomForHost(tx,host,{
        deploymentId:plan.deploymentId,courseVersionId:plan.courseVersionId,
        siteId:plan.siteId,
      });
      await tx.update(facilitatedClassroomPlans).set({
        state:"started",facilitatedSessionId:created.facilitatedSessionId,
        updatedAt:now,
      }).where(eq(facilitatedClassroomPlans.id,plan.id));
      await auditPlan(tx,host,plan.id,"started",{
        facilitatedSessionId:created.facilitatedSessionId,
      });
      return {...created,alreadyStarted:false};
    });
  });

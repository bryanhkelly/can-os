import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents, canonicalDeliverySessions, classroomDeploymentSites,
  classroomOfferingCourses, courseVersions, deploymentOfferingAdoptions,
  domainEvents, facilitatedClassroomPlans, offeringVersions,
  canonicalClassSessions, canonicalClassStaffAssignments,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import {
  validClassroomScheduleWindow, canOpenScheduledClassroom,
} from "@/domain/classroom-scheduling";
import { requireCanonicalFacilitator } from "./canonical-facilitator-access.server";
import {
  authorizedHostDeployment, createFacilitatedRoomForHost,
} from "./facilitated-learning-operations.server";
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
  if(!validClassroomScheduleWindow(start,end,now))
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
  // When a delivery plan belongs to a native Class, ownership of the Site and
  // old plan alone is insufficient to change its schedule or start its room.
  const [native]=await tx.select({classId:canonicalClassSessions.classId})
    .from(canonicalClassSessions)
    .where(eq(canonicalClassSessions.classroomPlanId,row.plan.id)).limit(1);
  if(native){
    const now=new Date();
    const [current]=await tx.select({id:canonicalClassStaffAssignments.id})
      .from(canonicalClassStaffAssignments).where(and(
        eq(canonicalClassStaffAssignments.classId,native.classId),
        eq(canonicalClassStaffAssignments.personId,host.actor.actorPersonId!),
        eq(canonicalClassStaffAssignments.state,"approved"),
        lte(canonicalClassStaffAssignments.beginsAt,now),
        or(isNull(canonicalClassStaffAssignments.endsAt),
          gt(canonicalClassStaffAssignments.endsAt,now)),
      )).limit(1);
    if(!current)throw new AuthorizationError("current Class teaching assignment for this delivery plan");
  }
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
type ScheduleCommand=z.infer<typeof scheduleInput>;
export async function scheduleOneClassroom(tx:Tx,host:Host,data:ScheduleCommand,now:Date){
  const startsAt=new Date(data.startsAt),endsAt=new Date(data.endsAt);
  validateClassroomTimes(startsAt,endsAt,now);
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
export const scheduleClassroom=createServerFn({method:"POST"})
  .validator((raw:unknown)=>scheduleInput.parse(raw))
  .handler(async({data})=>{
    guard();
    const host=await requireCanonicalFacilitator();
    return db.transaction(tx=>scheduleOneClassroom(tx,host,data,new Date()));
  });

/** Book a four-week sequence atomically, without creating or switching
 * enrollments. Every meeting passes the same current host/Course/Site gate.
 * Stable request IDs make a retried batch idempotent.
 */
export const scheduleFourWeekClassrooms=createServerFn({method:"POST"})
  .validator((raw:unknown)=>z.object({
    meetings:z.array(scheduleInput).length(4),
  }).strict().parse(raw))
  .handler(async({data})=>{
    guard();
    const host=await requireCanonicalFacilitator();
    const now=new Date();
    const first=data.meetings[0]!;
    const ids=new Set<string>();
    for(const [index,meeting] of data.meetings.entries()){
      if(meeting.deploymentId!==first.deploymentId||
        meeting.courseVersionId!==first.courseVersionId||
        meeting.siteId!==first.siteId||ids.has(meeting.requestId))
        throw new AuthorizationError("one distinct weekly schedule per authorized Site and Course");
      ids.add(meeting.requestId);
      const startsAt=new Date(meeting.startsAt),endsAt=new Date(meeting.endsAt);
      validateClassroomTimes(startsAt,endsAt,now);
      if(index>0){
        const previous=new Date(data.meetings[index-1]!.startsAt).getTime();
        const week=startsAt.getTime()-previous;
        if(week<7*86400000-3600000||week>7*86400000+3600000 ||
          endsAt.getTime()-startsAt.getTime()!==
            new Date(first.endsAt).getTime()-new Date(first.startsAt).getTime())
          throw new AuthorizationError("four consecutive weekly meetings with the same duration");
      }
    }
    return db.transaction(async tx=>{
      const plans=[];
      for(const meeting of data.meetings)
        plans.push(await scheduleOneClassroom(tx,host,meeting,now));
      return {plans,created:plans.filter(p=>!p.duplicate).length};
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
      if(delivery.startsAt.getTime()===startsAt.getTime() &&
         delivery.endsAt.getTime()===endsAt.getTime())
        return {saved:true,unchanged:true};
      await tx.update(canonicalDeliverySessions).set({startsAt,endsAt})
        .where(eq(canonicalDeliverySessions.id,delivery.id));
      await tx.update(facilitatedClassroomPlans).set({updatedAt:new Date()})
        .where(eq(facilitatedClassroomPlans.id,plan.id));
      await auditPlan(tx,host,plan.id,"rescheduled",{
        from:delivery.startsAt.toISOString(),to:startsAt.toISOString(),
        end:endsAt.toISOString(),
      });
      return {saved:true,unchanged:false};
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
      const [native]=await tx.select({id:canonicalClassSessions.id})
        .from(canonicalClassSessions)
        .where(eq(canonicalClassSessions.classroomPlanId,plan.id)).limit(1);
      // Native Class-controlled playback requires exact Class Session audience
      // enforcement across pairing, media and attendance. Never fall back to
      // the old deployment/Course/Site room authorization.
      if(native)throw new AuthorizationError("native Class room controls are not yet released");
      if(plan.state==="started" && plan.facilitatedSessionId)
        return {facilitatedSessionId:plan.facilitatedSessionId,
          pairingCode:null as string|null,pairingExpiresAt:null as string|null,
          alreadyStarted:true};
      if(plan.state!=="scheduled")throw new AuthorizationError("active scheduled classroom");
      const now=new Date();
      if(!canOpenScheduledClassroom(delivery.startsAt,delivery.endsAt,now))
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

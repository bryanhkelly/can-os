import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalClasses, canonicalClassSessions, canonicalClassStaffAssignments,
  canonicalClassEnrollments, learnerCourseAttempts, canonicalDeliverySessions,
  facilitatedClassroomPlans, auditEvents, domainEvents,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { currentClassAuthority } from "./native-class-enrollment.functions";
import { assertNativeClassSessionSeries } from "@/domain/native-class-sessions";
import { requireCanonicalFacilitator } from "@/modules/learning/canonical-facilitator-access.server";
import { requireFacilitatedLearningEnabled } from "@/modules/learning/canonical-learning-release.server";
import { scheduleOneClassroom, validateClassroomTimes } from "@/modules/learning/classroom-scheduling.functions";
import { createFacilitatedRoomForHost } from "@/modules/learning/facilitated-learning.functions";
import { canOpenScheduledClassroom } from "@/domain/classroom-scheduling";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Host=Awaited<ReturnType<typeof requireCanonicalFacilitator>>;
const uuid=z.string().uuid();
const datetime=z.string().datetime({offset:true});
export const nativeClassSessionScheduleSchema=z.object({
  classId:uuid,
  cadence:z.enum(["custom","weekly"]).default("custom"),
  meetings:z.array(z.object({
    requestId:uuid,startsAt:datetime,endsAt:datetime,
  }).strict()).min(1).max(12),
}).strict();

export async function requireNativeClassSessionHost(
  tx:Tx,host:Host,classId:string,now:Date,lock=false,
){
  const query=tx.select().from(canonicalClasses)
    .where(eq(canonicalClasses.id,classId)).limit(1);
  const [instance]=lock?await query.for("update"):await query;
  if(!instance || instance.state!=="active" || !instance.siteId ||
     instance.operatingOrganizationId!==host.organizationId ||
     !host.siteIds.includes(instance.siteId) ||
     !["scheduled","hybrid","facilitated"].includes(instance.deliveryMode))
    throw new AuthorizationError("active, authorized hosted Class");
  await currentClassAuthority(tx,instance.id,now);
  const [assignment]=await tx.select({
    id:canonicalClassStaffAssignments.id,
  }).from(canonicalClassStaffAssignments)
    .where(and(
      eq(canonicalClassStaffAssignments.classId,instance.id),
      eq(canonicalClassStaffAssignments.personId,host.actor.actorPersonId!),
      eq(canonicalClassStaffAssignments.state,"approved"),
      lte(canonicalClassStaffAssignments.beginsAt,now),
      or(isNull(canonicalClassStaffAssignments.endsAt),
        gt(canonicalClassStaffAssignments.endsAt,now)),
    )).limit(1);
  if(!assignment)throw new AuthorizationError("explicit active Class teaching assignment");
  return instance;
}

/** A native Class Session references the authoritative delivery timetable
 * and existing classroom plan. It does not create another enrollment, copy
 * Course material, or confer room pairing or private-media rights.
 */
export const scheduleNativeClassSessions=createServerFn({method:"POST"})
  .validator((raw:unknown)=>nativeClassSessionScheduleSchema.parse(raw))
  .handler(async({data})=>{
    if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true")
      throw new AuthorizationError("native Class release not activated");
    requireFacilitatedLearningEnabled();
    setResponseHeader("Cache-Control","private, no-store");
    const host=await requireCanonicalFacilitator();
    const now=new Date();
    assertNativeClassSessionSeries(data.meetings,data.cadence);
    for(const meeting of data.meetings){
      validateClassroomTimes(new Date(meeting.startsAt),new Date(meeting.endsAt),now);
    }
    return db.transaction(async tx=>{
      // Serialize one Class's schedule mutations, including overlapping
      // concurrent requests. Each individual plan is idempotently keyed.
      const instance=await requireNativeClassSessionHost(tx,host,data.classId,now,true);
      const results=[];
      for(const meeting of data.meetings){
        const booked=await scheduleOneClassroom(tx,host,{
          deploymentId:instance.deploymentId,
          courseVersionId:instance.courseVersionId,
          siteId:instance.siteId!,
          requestId:meeting.requestId,
          startsAt:meeting.startsAt,endsAt:meeting.endsAt,
        },now);
        const [plan]=await tx.select().from(facilitatedClassroomPlans)
          .where(eq(facilitatedClassroomPlans.id,booked.planId)).limit(1);
        if(!plan || plan.state!=="scheduled" || plan.enrollmentReleaseId!==null ||
           plan.facilitatedSessionId!==null ||
           plan.facilitatorPersonId!==host.actor.actorPersonId ||
           plan.hostOrganizationId!==host.organizationId ||
           plan.deploymentId!==instance.deploymentId ||
           plan.courseVersionId!==instance.courseVersionId ||
           plan.siteId!==instance.siteId)
          throw new AuthorizationError("exact unopened native Class delivery plan");

        const [linked]=await tx.select().from(canonicalClassSessions)
          .where(eq(canonicalClassSessions.classroomPlanId,plan.id)).limit(1);
        if(booked.duplicate){
          // Never adopt a previously scheduled noncredit, school or
          // different-Class plan by reusing its request ID.
          if(!linked || linked.classId!==instance.id ||
             linked.facilitatorPersonId!==host.actor.actorPersonId ||
             linked.requestId!==meeting.requestId ||
             linked.deliverySessionId!==plan.deliverySessionId)
            throw new AuthorizationError("unrelated classroom scheduling retry");
          results.push({classSessionId:linked.id,planId:plan.id,duplicate:true});
          continue;
        }
        if(linked)throw new AuthorizationError("delivery plan already bound to a Class");
        const [created]=await tx.insert(canonicalClassSessions).values({
          classId:instance.id,classroomPlanId:plan.id,
          deliverySessionId:plan.deliverySessionId,
          facilitatorPersonId:host.actor.actorPersonId!,
          requestId:meeting.requestId,
        }).returning({id:canonicalClassSessions.id});
        if(!created)throw new Error("Class Session reference was not recorded");
        await tx.insert(auditEvents).values({
          actorPersonId:host.actor.actorPersonId!,
          owningOrganizationId:host.organizationId,
          eventCode:"class.session.scheduled",
          entityKind:"class_session",entityId:created.id,
          payload:{classId:instance.id,planId:plan.id,
            deliverySessionId:plan.deliverySessionId,
            startsAt:meeting.startsAt,endsAt:meeting.endsAt},
        });
        await tx.insert(domainEvents).values({
          actorPersonId:host.actor.actorPersonId!,
          eventType:"ClassSessionScheduled",
          aggregateType:"class",aggregateId:instance.id,
          payload:{classSessionId:created.id,planId:plan.id,
            deliverySessionId:plan.deliverySessionId},
        });
        results.push({classSessionId:created.id,planId:plan.id,duplicate:false});
      }
      return {
        classId:instance.id,sessions:results,
        created:results.filter(r=>!r.duplicate).length,
        note:"Scheduling does not pair participants, issue attendance or authorize classroom playback.",
      };
    });
  });


const openInput=z.object({classId:uuid,classSessionId:uuid}).strict();

/** Opens only a precisely bound Class Session near its scheduled start.
 * Unlike generic Course/Site rooms, the native Class's enrolled audience
 * must already exist and every pairing/media command checks it again.
 */
export const openNativeClassSession=createServerFn({method:"POST"})
  .validator((raw:unknown)=>openInput.parse(raw))
  .handler(async({data})=>{
    if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true")
      throw new AuthorizationError("native Class release not activated");
    requireFacilitatedLearningEnabled();
    setResponseHeader("Cache-Control","private, no-store");
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const now=new Date();
      const instance=await requireNativeClassSessionHost(tx,host,data.classId,now,true);
      const [link]=await tx.select().from(canonicalClassSessions)
        .where(and(eq(canonicalClassSessions.id,data.classSessionId),
          eq(canonicalClassSessions.classId,instance.id))).limit(1);
      if(!link||link.facilitatorPersonId!==host.actor.actorPersonId)
        throw new AuthorizationError("your own assigned Class Session");
      const [plan]=await tx.select().from(facilitatedClassroomPlans)
        .where(eq(facilitatedClassroomPlans.id,link.classroomPlanId))
        .for("update").limit(1);
      const [delivery]=await tx.select().from(canonicalDeliverySessions)
        .where(eq(canonicalDeliverySessions.id,link.deliverySessionId)).limit(1);
      if(!plan||!delivery ||
         plan.deliverySessionId!==delivery.id ||
         plan.deploymentId!==instance.deploymentId ||
         plan.courseVersionId!==instance.courseVersionId ||
         plan.siteId!==instance.siteId ||
         plan.hostOrganizationId!==host.organizationId ||
         plan.facilitatorPersonId!==host.actor.actorPersonId ||
         plan.enrollmentReleaseId!==null ||
         delivery.siteId!==instance.siteId ||
         delivery.deploymentId!==instance.deploymentId)
        throw new AuthorizationError("unmodified, currently authorized Class Session");
      if(plan.state==="started"&&plan.facilitatedSessionId)
        return {classSessionId:link.id,facilitatedSessionId:plan.facilitatedSessionId,
          pairingCode:null as string|null,pairingExpiresAt:null as string|null,
          alreadyStarted:true};
      if(plan.state!=="scheduled"||plan.facilitatedSessionId!==null||
         !canOpenScheduledClassroom(delivery.startsAt,delivery.endsAt,now))
        throw new AuthorizationError("open this Class Session near its scheduled time");

      // Requiring a participant from THIS Class prevents the old generic
      // Course/Site active-attempt check from opening the wrong classroom.
      const [audience]=await tx.select({id:canonicalClassEnrollments.id})
        .from(canonicalClassEnrollments)
        .innerJoin(learnerCourseAttempts,and(
          eq(learnerCourseAttempts.id,canonicalClassEnrollments.courseAttemptId),
          eq(learnerCourseAttempts.classEnrollmentId,canonicalClassEnrollments.id),
          eq(learnerCourseAttempts.courseVersionId,instance.courseVersionId),
          eq(learnerCourseAttempts.deploymentId,instance.deploymentId),
          eq(learnerCourseAttempts.adoptionId,instance.adoptionId),
          eq(learnerCourseAttempts.offeringVersionId,instance.offeringVersionId),
          eq(learnerCourseAttempts.status,"active"),
          isNull(learnerCourseAttempts.enrollmentId),
          isNull(learnerCourseAttempts.noncreditRegistrationId),
        )).where(and(
          eq(canonicalClassEnrollments.classId,instance.id),
          eq(canonicalClassEnrollments.status,"active"),
        )).limit(1);
      if(!audience)throw new AuthorizationError("at least one enrolled Class learner before opening a room");
      const room=await createFacilitatedRoomForHost(tx,host,{
        deploymentId:instance.deploymentId,courseVersionId:instance.courseVersionId,
        siteId:instance.siteId!,
      });
      await tx.update(facilitatedClassroomPlans).set({
        state:"started",facilitatedSessionId:room.facilitatedSessionId,
        updatedAt:now,
      }).where(eq(facilitatedClassroomPlans.id,plan.id));
      await tx.insert(auditEvents).values({
        actorPersonId:host.actor.actorPersonId!,
        owningOrganizationId:host.organizationId,
        eventCode:"class.session.started",
        entityKind:"class_session",entityId:link.id,
        payload:{classId:instance.id,planId:plan.id,
          facilitatedSessionId:room.facilitatedSessionId},
      });
      await tx.insert(domainEvents).values({
        actorPersonId:host.actor.actorPersonId!,
        eventType:"ClassSessionStarted",aggregateType:"class",
        aggregateId:instance.id,
        payload:{classSessionId:link.id,facilitatedSessionId:room.facilitatedSessionId},
      });
      return {classSessionId:link.id,...room,alreadyStarted:false};
    });
  });

import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalClasses, canonicalClassSessions, canonicalClassStaffAssignments,
  facilitatedClassroomPlans, auditEvents, domainEvents,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { currentClassAuthority } from "./native-class-enrollment.functions";
import { assertNativeClassSessionSeries } from "@/domain/native-class-sessions";
import { requireCanonicalFacilitator } from "@/modules/learning/canonical-facilitator-access.server";
import { requireFacilitatedLearningEnabled } from "@/modules/learning/canonical-learning-release.server";
import { scheduleOneClassroom, validateClassroomTimes } from "@/modules/learning/classroom-scheduling.functions";

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

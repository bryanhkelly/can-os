import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, isNull, gt, lte, or, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  facilitatedLearningParticipants, facilitatedLearningSessions,
  facilitatedRoomActivityReleases, facilitatedRoomActivityResponses,
  facilitatedRoomPresenceEvents, facilitatedRoomAttendanceAssertions,
  facilitatedRoomFeedback, facilitatedRoomSurveyCampaigns,
  surveyCampaigns, learnerCourseAttempts,
} from "@/db/canonical-v301";
import { classroomDeploymentSites, classroomEnrollmentSitePlacements } from "@/db/canonical-v301/classroom-site-placements";
import { classroomPersons } from "@/db/canonical-v301/classroom-persons";
import { AuthorizationError } from "@/domain/command-context";
import { facilitatedRoomMaxMs } from "@/domain/facilitated-learning";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "./canonical-course-participation.server";
import { requireCanonicalFacilitator } from "./canonical-facilitator-access.server";
import { ownedRoom } from "./facilitated-learning.functions";
import { requireFacilitatedLearningEnabled } from "./canonical-learning-release.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const uuid = z.string().uuid();
const roomInput = z.object({ facilitatedSessionId: uuid }).strict();
const learnerInput = roomInput.extend({ courseAttemptId: uuid }).strict();
function guard() {
  requireFacilitatedLearningEnabled();
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("Referrer-Policy", "no-referrer");
}
function assertLive(room: typeof facilitatedLearningSessions.$inferSelect, now = new Date()) {
  if(room.state !== "live" || !!room.endedAt || room.startedAt > now ||
    now.getTime() - room.startedAt.getTime() >= facilitatedRoomMaxMs)
    throw new AuthorizationError("active classroom room");
}
async function learnerRoom(tx: Tx, courseAttemptId: string, facilitatedSessionId: string) {
  const actor = await getInstructionalLearnerContext(getRequest());
  if(!actor.actorPersonId || !["student","learner"].includes(actor.role ?? ""))
    throw new AuthorizationError("authenticated course learner");
  const access = await authorizeCanonicalCourseAttempt(tx, actor, courseAttemptId);
  const [pair] = await tx.select().from(facilitatedLearningParticipants)
    .where(and(
      eq(facilitatedLearningParticipants.facilitatedSessionId, facilitatedSessionId),
      eq(facilitatedLearningParticipants.courseAttemptId, courseAttemptId),
      eq(facilitatedLearningParticipants.participantPersonId, actor.actorPersonId),
      isNull(facilitatedLearningParticipants.leftAt),
    )).limit(1);
  const [room] = await tx.select().from(facilitatedLearningSessions)
    .where(eq(facilitatedLearningSessions.id, facilitatedSessionId)).limit(1);
  if(!room || !pair || room.deploymentId !== access.deploymentId ||
      room.courseVersionId !== access.courseVersionId)
    throw new AuthorizationError("current room participant");
  assertLive(room);
  if(access.source === "school") {
    const [attempt] = await tx.select({ enrollmentId: learnerCourseAttempts.enrollmentId })
      .from(learnerCourseAttempts).where(eq(learnerCourseAttempts.id, courseAttemptId)).limit(1);
    if(!attempt?.enrollmentId) throw new AuthorizationError("school enrollment placement");
    const now = new Date();
    const [placement] = await tx.select({ id: classroomEnrollmentSitePlacements.id })
      .from(classroomEnrollmentSitePlacements)
      .innerJoin(classroomDeploymentSites,and(
        eq(classroomEnrollmentSitePlacements.deploymentSiteId, classroomDeploymentSites.id),
        eq(classroomDeploymentSites.siteId, room.siteId),
        eq(classroomDeploymentSites.deploymentId,room.deploymentId),
      ))
      .where(and(
        eq(classroomEnrollmentSitePlacements.enrollmentId, attempt.enrollmentId),
        eq(classroomEnrollmentSitePlacements.deploymentId,room.deploymentId),
        lte(classroomEnrollmentSitePlacements.startsAt,now),
        or(isNull(classroomEnrollmentSitePlacements.endsAt),
          gt(classroomEnrollmentSitePlacements.endsAt,now)),
      )).limit(1);
    if(!placement) throw new AuthorizationError("current school Site placement");
  }
  return {room,personId:actor.actorPersonId};
}

export const getClassroomLearnerActivities = createServerFn({method:"GET"})
  .validator((value:unknown)=>learnerInput.parse(value))
  .handler(async({data})=>{
    guard();
    return db.transaction(async tx=>{
      await learnerRoom(tx,data.courseAttemptId,data.facilitatedSessionId);
      const releases=await tx.select().from(facilitatedRoomActivityReleases)
        .where(eq(facilitatedRoomActivityReleases.facilitatedSessionId,data.facilitatedSessionId))
        .orderBy(desc(facilitatedRoomActivityReleases.releasedAt)).limit(30);
      const people=paired.length ? await tx.select({
        id:classroomPersons.id,firstName:classroomPersons.legalFirstName,
        lastName:classroomPersons.legalLastName,preferredName:classroomPersons.preferredName,
      }).from(classroomPersons).where(inArray(classroomPersons.id,paired.map(p=>p.personId))) : [];
      const names=new Map(people.map(p=>[p.id,
        [p.preferredName||p.firstName,p.lastName].filter(Boolean).join(" ").trim()]));
      const responses=await tx.select({
        activityReleaseId:facilitatedRoomActivityResponses.activityReleaseId,
        submittedAt:facilitatedRoomActivityResponses.submittedAt,
      }).from(facilitatedRoomActivityResponses).where(and(
        eq(facilitatedRoomActivityResponses.facilitatedSessionId,data.facilitatedSessionId),
        eq(facilitatedRoomActivityResponses.courseAttemptId,data.courseAttemptId),
      )).limit(250);
      return {activities:releases.map(r=>({
        id:r.id,prompt:r.prompt,answerType:r.answerType,choices:r.choices,
        releasedAt:r.releasedAt.toISOString(),closed:r.closedAt!==null,
        responded:responses.some(a=>a.activityReleaseId===r.id),
      })),notice:"Unmarked formative responses do not change course grades or completion."};
    });
  });

const releaseInput = roomInput.extend({
  requestId:uuid,
  lessonId:uuid.nullable(),
  prompt:z.string().trim().min(5).max(1000),
  answerType:z.enum(["single_choice","text"]),
  choices:z.array(z.string().trim().min(1).max(200)).max(8),
}).strict().superRefine((v,ctx)=>{
  if(v.answerType==="single_choice" && v.choices.length<2)
    ctx.addIssue({code:"custom",path:["choices"],message:"Choose at least two options"});
  if(v.answerType==="text" && v.choices.length)
    ctx.addIssue({code:"custom",path:["choices"],message:"Text prompts have no options"});
});
export const releaseClassroomActivity = createServerFn({method:"POST"})
  .validator((value:unknown)=>releaseInput.parse(value))
  .handler(async({data})=>{
    guard();
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId,true);
      assertLive(room);
      const [saved]=await tx.insert(facilitatedRoomActivityReleases).values({
        facilitatedSessionId:room.id,releasedByPersonId:host.actor.actorPersonId!,
        requestId:data.requestId,lessonId:data.lessonId,prompt:data.prompt,
        answerType:data.answerType,choices:data.choices,
      }).onConflictDoNothing().returning({id:facilitatedRoomActivityReleases.id});
      if(!saved) {
        const [existing]=await tx.select().from(facilitatedRoomActivityReleases).where(and(
          eq(facilitatedRoomActivityReleases.facilitatedSessionId,room.id),
          eq(facilitatedRoomActivityReleases.requestId,data.requestId),
        )).limit(1);
        if(!existing || existing.prompt!==data.prompt ||
          existing.answerType!==data.answerType ||
          JSON.stringify(existing.choices)!==JSON.stringify(data.choices) ||
          existing.lessonId!==data.lessonId)
          throw new Error("Conflicting classroom activity retry");
        return {id:existing.id,duplicate:true};
      }
      return {id:saved.id,duplicate:false};
    });
  });

export const closeClassroomActivity = createServerFn({method:"POST"})
  .validator((v:unknown)=>roomInput.extend({activityReleaseId:uuid}).parse(v))
  .handler(async({data})=>{
    guard();
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId,true);
      assertLive(room);
      const [updated]=await tx.update(facilitatedRoomActivityReleases)
        .set({closedAt:new Date()})
        .where(and(eq(facilitatedRoomActivityReleases.id,data.activityReleaseId),
          eq(facilitatedRoomActivityReleases.facilitatedSessionId,room.id),
          isNull(facilitatedRoomActivityReleases.closedAt)))
        .returning({id:facilitatedRoomActivityReleases.id});
      return {closed:!!updated};
    });
  });

export const submitClassroomResponse = createServerFn({method:"POST"})
  .validator((v:unknown)=>learnerInput.extend({
    activityReleaseId:uuid,clientSubmissionId:uuid,clientInstanceId:uuid,
    answerChoice:z.number().int().min(0).max(7).nullable(),
    answerText:z.string().trim().min(1).max(1000).nullable(),
  }).strict().refine(v=>(v.answerChoice===null)!==(v.answerText===null),
    "Provide exactly one answer type").parse(v))
  .handler(async({data})=>{
    guard();
    return db.transaction(async tx=>{
      const {room,personId}=await learnerRoom(tx,data.courseAttemptId,data.facilitatedSessionId);
      const [release]=await tx.select().from(facilitatedRoomActivityReleases)
        .where(and(eq(facilitatedRoomActivityReleases.id,data.activityReleaseId),
          eq(facilitatedRoomActivityReleases.facilitatedSessionId,room.id)))
        .limit(1);
      if(!release || release.closedAt ||
        (release.answerType==="single_choice" &&
          (data.answerChoice===null || data.answerChoice>=release.choices.length)) ||
        (release.answerType==="text" && data.answerText===null))
        throw new AuthorizationError("open classroom activity and matching response");
      const [saved]=await tx.insert(facilitatedRoomActivityResponses).values({
        facilitatedSessionId:room.id,activityReleaseId:release.id,
        courseAttemptId:data.courseAttemptId,participantPersonId:personId,
        clientInstanceId:data.clientInstanceId,clientSubmissionId:data.clientSubmissionId,
        answerChoice:data.answerChoice,answerText:data.answerText,
      }).onConflictDoNothing().returning({id:facilitatedRoomActivityResponses.id});
      if(!saved) {
        const [existing]=await tx.select().from(facilitatedRoomActivityResponses).where(and(
          eq(facilitatedRoomActivityResponses.activityReleaseId,release.id),
          eq(facilitatedRoomActivityResponses.courseAttemptId,data.courseAttemptId),
          eq(facilitatedRoomActivityResponses.clientSubmissionId,data.clientSubmissionId),
        )).limit(1);
        if(!existing || existing.answerChoice!==data.answerChoice ||
          existing.answerText!==data.answerText || existing.clientInstanceId!==data.clientInstanceId)
          throw new Error("Conflicting learner response retry");
      }
      return {saved:true,duplicate:!saved,graded:false};
    });
  });

export const recordClassroomPresence = createServerFn({method:"POST"})
  .validator((v:unknown)=>learnerInput.extend({
    clientInstanceId:uuid,clientEventId:uuid,
    eventKind:z.enum(["joined","heartbeat","away","left"]),
  }).strict().parse(v))
  .handler(async({data})=>{
    guard();
    return db.transaction(async tx=>{
      const {room,personId}=await learnerRoom(tx,data.courseAttemptId,data.facilitatedSessionId);
      const [existing]=await tx.select({id:facilitatedRoomPresenceEvents.id,
        eventKind:facilitatedRoomPresenceEvents.eventKind,
        clientInstanceId:facilitatedRoomPresenceEvents.clientInstanceId,
        participantPersonId:facilitatedRoomPresenceEvents.participantPersonId})
        .from(facilitatedRoomPresenceEvents).where(and(
          eq(facilitatedRoomPresenceEvents.facilitatedSessionId,room.id),
          eq(facilitatedRoomPresenceEvents.courseAttemptId,data.courseAttemptId),
          eq(facilitatedRoomPresenceEvents.clientEventId,data.clientEventId),
        )).limit(1);
      if(existing){
        if(existing.eventKind!==data.eventKind || existing.clientInstanceId!==data.clientInstanceId ||
          existing.participantPersonId!==personId)throw new Error("Conflicting classroom presence retry");
        return {recorded:true,duplicate:true};
      }
      // Server-side suppression prevents abusive clients from flooding telemetry.
      if(data.eventKind==="heartbeat"){
        const [recent]=await tx.select({id:facilitatedRoomPresenceEvents.id})
          .from(facilitatedRoomPresenceEvents).where(and(
            eq(facilitatedRoomPresenceEvents.facilitatedSessionId,room.id),
            eq(facilitatedRoomPresenceEvents.courseAttemptId,data.courseAttemptId),
            eq(facilitatedRoomPresenceEvents.clientInstanceId,data.clientInstanceId),
            eq(facilitatedRoomPresenceEvents.eventKind,"heartbeat"),
            gt(facilitatedRoomPresenceEvents.receivedAt,new Date(Date.now()-30_000)),
          )).orderBy(desc(facilitatedRoomPresenceEvents.receivedAt)).limit(1);
        if(recent)return {recorded:false,duplicate:false,throttled:true};
      }
      await tx.insert(facilitatedRoomPresenceEvents).values({
        facilitatedSessionId:room.id,courseAttemptId:data.courseAttemptId,
        participantPersonId:personId,clientInstanceId:data.clientInstanceId,
        clientEventId:data.clientEventId,eventKind:data.eventKind,
      }).onConflictDoNothing();
      return {recorded:true,duplicate:false};
    });
  });

const attendanceInput = learnerInput.extend({
  requestId:uuid,status:z.enum(["present","absent","unknown"]),
  method:z.enum(["in_person_roll_call","remote_live_check"]),
  evidenceNote:z.string().trim().max(250).nullable(),
}).strict();
export const attestClassroomAttendance = createServerFn({method:"POST"})
  .validator((v:unknown)=>attendanceInput.parse(v))
  .handler(async({data})=>{
    guard();
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId,true);
      assertLive(room);
      const [paired]=await tx.select({id:facilitatedLearningParticipants.id})
        .from(facilitatedLearningParticipants).where(and(
          eq(facilitatedLearningParticipants.facilitatedSessionId,room.id),
          eq(facilitatedLearningParticipants.courseAttemptId,data.courseAttemptId),
        )).limit(1);
      if(!paired)throw new AuthorizationError("registered classroom participant");
      const [saved]=await tx.insert(facilitatedRoomAttendanceAssertions).values({
        facilitatedSessionId:room.id,courseAttemptId:data.courseAttemptId,
        facilitatorPersonId:host.actor.actorPersonId!,requestId:data.requestId,
        status:data.status,method:data.method,evidenceNote:data.evidenceNote,
      }).onConflictDoNothing().returning({id:facilitatedRoomAttendanceAssertions.id});
      if(!saved){
        const [existing]=await tx.select().from(facilitatedRoomAttendanceAssertions).where(and(
          eq(facilitatedRoomAttendanceAssertions.facilitatedSessionId,room.id),
          eq(facilitatedRoomAttendanceAssertions.requestId,data.requestId),
        )).limit(1);
        if(!existing || existing.courseAttemptId!==data.courseAttemptId ||
          existing.facilitatorPersonId!==host.actor.actorPersonId ||
          existing.status!==data.status || existing.method!==data.method ||
          existing.evidenceNote!==data.evidenceNote)
          throw new Error("Conflicting attendance assertion retry");
      }
      return {saved:true,duplicate:!saved,evidenceLevel:"facilitator_attested" as const};
    });
  });

export const getClassroomHostActivity = createServerFn({method:"GET"})
  .validator((v:unknown)=>roomInput.parse(v))
  .handler(async({data})=>{
    guard();
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId);
      const releases=await tx.select().from(facilitatedRoomActivityReleases)
        .where(eq(facilitatedRoomActivityReleases.facilitatedSessionId,room.id))
        .orderBy(desc(facilitatedRoomActivityReleases.releasedAt)).limit(40);
      const paired=await tx.select({courseAttemptId:facilitatedLearningParticipants.courseAttemptId,
        personId:facilitatedLearningParticipants.participantPersonId})
        .from(facilitatedLearningParticipants).where(and(
          eq(facilitatedLearningParticipants.facilitatedSessionId,room.id),
          isNull(facilitatedLearningParticipants.leftAt),
        )).limit(300);
      const responses=await tx.select({
        activityReleaseId:facilitatedRoomActivityResponses.activityReleaseId,
        courseAttemptId:facilitatedRoomActivityResponses.courseAttemptId,
      }).from(facilitatedRoomActivityResponses)
        .where(eq(facilitatedRoomActivityResponses.facilitatedSessionId,room.id)).limit(1500);
      const presence=await tx.select({
        courseAttemptId:facilitatedRoomPresenceEvents.courseAttemptId,
        clientInstanceId:facilitatedRoomPresenceEvents.clientInstanceId,
        eventKind:facilitatedRoomPresenceEvents.eventKind,
        receivedAt:facilitatedRoomPresenceEvents.receivedAt,
      }).from(facilitatedRoomPresenceEvents)
        .where(eq(facilitatedRoomPresenceEvents.facilitatedSessionId,room.id))
        .orderBy(desc(facilitatedRoomPresenceEvents.receivedAt)).limit(2000);
      const current=new Map<string,typeof presence[number]>();
      for(const event of presence){
        const key=event.courseAttemptId+":"+event.clientInstanceId;
        if(!current.has(key))current.set(key,event);
      }
      const live=new Set([...current.values()].filter(event=>
        ["joined","heartbeat"].includes(event.eventKind) &&
        Date.now()-event.receivedAt.getTime()<90_000).map(e=>e.courseAttemptId));
      const attested=await tx.select().from(facilitatedRoomAttendanceAssertions)
        .where(eq(facilitatedRoomAttendanceAssertions.facilitatedSessionId,room.id))
        .orderBy(desc(facilitatedRoomAttendanceAssertions.assertedAt)).limit(1000);
      const latest=new Map<string,typeof attested[number]>();
      for(const a of attested)if(!latest.has(a.courseAttemptId))latest.set(a.courseAttemptId,a);
      return {
        releases:releases.map(r=>({
          id:r.id,prompt:r.prompt,answerType:r.answerType,choices:r.choices,
          closed:r.closedAt!==null,releasedAt:r.releasedAt.toISOString(),
          responseEvents:responses.filter(a=>a.activityReleaseId===r.id).length,
          respondingLearners:new Set(responses.filter(a=>a.activityReleaseId===r.id).map(a=>a.courseAttemptId)).size,
        })),
        participants:paired.map(p=>({
          courseAttemptId:p.courseAttemptId,
          displayName:names.get(p.personId)??"Unnamed learner",
          deviceActive:live.has(p.courseAttemptId),
          attendance:latest.get(p.courseAttemptId)?.status??"unknown",
        })),
        pairedCount:paired.length,activeDevicesEstimate:live.size,
        attestedPresent:[...latest.values()].filter(v=>v.status==="present").length,
        labels:{device:"Device connection observed, not on-site attendance",
          attendance:"Latest facilitator attestation, not official academic attendance"},
      };
    });
  });

export const submitClassroomFeedback = createServerFn({method:"POST"})
  .validator((v:unknown)=>learnerInput.extend({
    questionKey:z.enum(["clarity","technology","value"]),
    rating:z.number().int().min(1).max(5),
  }).strict().parse(v))
  .handler(async({data})=>{
    guard();
    return db.transaction(async tx=>{
      const {room,personId}=await learnerRoom(tx,data.courseAttemptId,data.facilitatedSessionId);
      await tx.insert(facilitatedRoomFeedback).values({
        facilitatedSessionId:room.id,courseAttemptId:data.courseAttemptId,
        participantPersonId:personId,questionKey:data.questionKey,rating:data.rating,
      }).onConflictDoUpdate({
        target:[facilitatedRoomFeedback.facilitatedSessionId,
          facilitatedRoomFeedback.courseAttemptId,facilitatedRoomFeedback.questionKey],
        set:{rating:data.rating,updatedAt:new Date()},
      });
      return {saved:true};
    });
  });

export const attachClassroomSurvey = createServerFn({method:"POST"})
  .validator((v:unknown)=>roomInput.extend({
    surveyCampaignId:uuid,stage:z.enum(["entry","pulse","exit"]),
  }).strict().parse(v))
  .handler(async({data})=>{
    guard();
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId,true);
      const [campaign]=await tx.select().from(surveyCampaigns).where(and(
        eq(surveyCampaigns.id,data.surveyCampaignId),
        eq(surveyCampaigns.operatingOrganizationId,room.hostOrganizationId),
        eq(surveyCampaigns.deploymentId,room.deploymentId),
      )).limit(1);
      if(!campaign)throw new AuthorizationError("authorized survey campaign at this deployment");
      await tx.insert(facilitatedRoomSurveyCampaigns).values({
        facilitatedSessionId:room.id,surveyCampaignId:campaign.id,
        stage:data.stage,linkedByPersonId:host.actor.actorPersonId!,
      }).onConflictDoNothing();
      return {linked:true};
    });
  });

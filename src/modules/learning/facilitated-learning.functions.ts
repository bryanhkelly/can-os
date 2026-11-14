import { createHash, randomInt, createHmac } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, countDistinct, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  catalogSites, contentAssetVersions, courseLessons, courseVersions, courses,
  educationOperationSites, facilitatedLearningParticipants, facilitatedLearningPlayback,
  facilitatedLearningSessions, learnerCourseAttempts, programDeployments,
  siteOrganizationRoles, trackLessonPresentations,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import {
  canPairFacilitatedLearning, facilitatedCodeAlphabet, facilitatedCodeLength,
  facilitatedPairSchema, facilitatedPairingWindowMs, facilitatedPlaybackSchema,
  facilitatedRoomMaxMs, facilitatedStartSchema, normalizeFacilitatedPairingCode,
} from "@/domain/facilitated-learning";
import { requireCanonicalLabProvider } from "@/modules/operations/canonical-capability-lab-access.server";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "./canonical-course-participation.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Host = Awaited<ReturnType<typeof requireCanonicalLabProvider>>;
const roomIdInput = z.object({ facilitatedSessionId: z.string().uuid() }).strict();
const joinInput = facilitatedPairSchema;
const leaveInput = z.object({
  facilitatedSessionId: z.string().uuid(), courseAttemptId: z.string().uuid(),
}).strict();
function privateResult() {
  setResponseHeader("Cache-Control", "private, no-store");
}
function pairingPepper() {
  const pepper = process.env.CAN_FACILITATED_PAIRING_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("Facilitated pairing is not configured.");
  return pepper;
}
function digestCode(code: string) {
  return createHmac("sha256", pairingPepper()).update(code).digest("hex");
}
function generatePairingCode() {
  let code = "";
  for (let i = 0; i < facilitatedCodeLength; i++) {
    code += facilitatedCodeAlphabet[randomInt(facilitatedCodeAlphabet.length)];
  }
  return code;
}
function displayCode(code: string) { return code.slice(0, 5) + "-" + code.slice(5); }

/** A site membership is not enough. Require an active operation-site relationship
 * AND a current host/operator organization relationship at that same Site.
 * A separate network/denomination affiliation is never required.
 */
async function authorizedHostDeployment(tx: Tx, host: Host, deploymentId: string) {
  const now = new Date();
  const [deployment] = await tx.select({
    id: programDeployments.id, operationId: programDeployments.operationId,
    name: programDeployments.name, status: programDeployments.status,
  }).from(programDeployments).where(eq(programDeployments.id, deploymentId)).limit(1);
  if (!deployment || !["authorized", "active"].includes(deployment.status))
    throw new AuthorizationError("active or authorized deployment");
  const [authorizedSite] = await tx.select({siteId:educationOperationSites.siteId})
    .from(educationOperationSites)
    .innerJoin(siteOrganizationRoles,and(
      eq(siteOrganizationRoles.siteId,educationOperationSites.siteId),
      eq(siteOrganizationRoles.organizationId,host.organizationId),
      inArray(siteOrganizationRoles.roleCode,["operator","host"]),
      lte(siteOrganizationRoles.validFrom,now),
      or(isNull(siteOrganizationRoles.validThrough),gt(siteOrganizationRoles.validThrough,now)),
    ))
    .innerJoin(catalogSites,and(
      eq(catalogSites.id,educationOperationSites.siteId),
      eq(catalogSites.status,"active"),
    ))
    .where(and(
      eq(educationOperationSites.operationId,deployment.operationId),
      inArray(educationOperationSites.siteId,host.siteIds),
      lte(educationOperationSites.validFrom,now),
      or(isNull(educationOperationSites.validThrough),gt(educationOperationSites.validThrough,now)),
    )).limit(1);
  if (!authorizedSite) throw new AuthorizationError("current operator/host at deployment Site");
  return {deployment, siteId:authorizedSite.siteId};
}
async function ownedRoom(tx:Tx, host:Host, id:string, lock=false) {
  const query = tx.select().from(facilitatedLearningSessions).where(and(
    eq(facilitatedLearningSessions.id,id),
    eq(facilitatedLearningSessions.hostOrganizationId,host.organizationId),
    eq(facilitatedLearningSessions.facilitatorPersonId,host.actor.actorPersonId!),
    inArray(facilitatedLearningSessions.siteId,host.siteIds),
  )).limit(1);
  const [room] = lock ? await query.for("update") : await query;
  if(!room) throw new AuthorizationError("owned facilitated learning room");
  const access = await authorizedHostDeployment(tx,host,room.deploymentId);
  if(access.siteId!==room.siteId) throw new AuthorizationError("current Site hosting authority");
  return room;
}
function assertRoomLive(room: typeof facilitatedLearningSessions.$inferSelect, now:Date) {
  if(room.state!=="live" || room.endedAt || room.startedAt>now ||
    now.getTime()-room.startedAt.getTime()>facilitatedRoomMaxMs)
    throw new AuthorizationError("current facilitated room");
}
async function validateRoomVideo(tx: Tx, courseVersionId:string, lessonId:string,assetVersionId:string) {
  const [presentation] = await tx.select({id:trackLessonPresentations.id})
    .from(trackLessonPresentations)
    .innerJoin(courseLessons,and(
      eq(courseLessons.id,trackLessonPresentations.courseLessonId),
      eq(courseLessons.courseVersionId,courseVersionId),
    ))
    .innerJoin(contentAssetVersions,and(
      eq(contentAssetVersions.id,trackLessonPresentations.assetVersionId),
      eq(contentAssetVersions.lifecycle,"published"),
    ))
    .where(and(
      eq(trackLessonPresentations.courseVersionId,courseVersionId),
      eq(trackLessonPresentations.courseLessonId,lessonId),
      eq(trackLessonPresentations.assetVersionId,assetVersionId),
    )).limit(1);
  if(!presentation) throw new AuthorizationError("published presentation in this course");
}

export const getFacilitatedHostWorkspace = createServerFn({method:"GET"})
  .handler(async()=>{
    privateResult();
    const host = await requireCanonicalLabProvider();
    return db.transaction(async tx=>{
      const now = new Date();
      const potential = await tx.select({
        deploymentId:programDeployments.id,deploymentName:programDeployments.name,
        operationId:programDeployments.operationId,
      }).from(programDeployments).where(inArray(programDeployments.status,["active","authorized"]))
        .orderBy(asc(programDeployments.name)).limit(200);
      const visible: {deploymentId:string;deploymentName:string;siteId:string}[] = [];
      for(const deployment of potential){
        try {
          const access=await authorizedHostDeployment(tx,host,deployment.deploymentId);
          visible.push({deploymentId:deployment.deploymentId,
            deploymentName:deployment.deploymentName,siteId:access.siteId});
        } catch(error) {
          if (!(error instanceof AuthorizationError)) throw error;
        }
      }
      const deploymentIds=visible.map(row=>row.deploymentId);
      const versions=deploymentIds.length ? await tx.select({
        deploymentId:learnerCourseAttempts.deploymentId,
        courseVersionId:learnerCourseAttempts.courseVersionId,
        courseTitle:courses.title,
      }).from(learnerCourseAttempts)
        .innerJoin(courseVersions,and(
          eq(courseVersions.id,learnerCourseAttempts.courseVersionId),
          eq(courseVersions.lifecycle,"published"),
        ))
        .innerJoin(courses,eq(courses.id,courseVersions.courseId))
        .where(and(
          inArray(learnerCourseAttempts.deploymentId,deploymentIds),
          eq(learnerCourseAttempts.status,"active"),
        )).groupBy(learnerCourseAttempts.deploymentId,
          learnerCourseAttempts.courseVersionId,courses.title).limit(200) : [];
      const choices=versions.map(version=>({
        ...version,siteId:visible.find(row=>row.deploymentId===version.deploymentId)!.siteId,
        deploymentName:visible.find(row=>row.deploymentId===version.deploymentId)!.deploymentName,
      }));
      const rooms=await tx.select({
        id:facilitatedLearningSessions.id,
        deploymentId:facilitatedLearningSessions.deploymentId,
        courseVersionId:facilitatedLearningSessions.courseVersionId,
        siteId:facilitatedLearningSessions.siteId,
        state:facilitatedLearningSessions.state,
        startedAt:facilitatedLearningSessions.startedAt,
        pairingExpiresAt:facilitatedLearningSessions.pairingExpiresAt,
        endedAt:facilitatedLearningSessions.endedAt,
      }).from(facilitatedLearningSessions).where(and(
        eq(facilitatedLearningSessions.hostOrganizationId,host.organizationId),
        eq(facilitatedLearningSessions.facilitatorPersonId,host.actor.actorPersonId!),
        inArray(facilitatedLearningSessions.siteId,host.siteIds),
      )).orderBy(desc(facilitatedLearningSessions.startedAt)).limit(30);
      const authorizedRooms=rooms.filter(room=>visible.some(
        choice=>choice.deploymentId===room.deploymentId&&choice.siteId===room.siteId));
      const ids=authorizedRooms.map(room=>room.id);
      const counts=ids.length ? await tx.select({
        id:facilitatedLearningParticipants.facilitatedSessionId,
        total:countDistinct(facilitatedLearningParticipants.courseAttemptId),
      }).from(facilitatedLearningParticipants).where(and(
        inArray(facilitatedLearningParticipants.facilitatedSessionId,ids),
        isNull(facilitatedLearningParticipants.leftAt),
      )).groupBy(facilitatedLearningParticipants.facilitatedSessionId) : [];
      const playback=ids.length ? await tx.select({
        sessionId:facilitatedLearningPlayback.facilitatedSessionId,
        kind:facilitatedLearningPlayback.kind,
        lessonId:facilitatedLearningPlayback.lessonId,
        assetVersionId:facilitatedLearningPlayback.assetVersionId,
        occurredAt:facilitatedLearningPlayback.occurredAt,
      }).from(facilitatedLearningPlayback)
        .where(inArray(facilitatedLearningPlayback.facilitatedSessionId,ids))
        .orderBy(desc(facilitatedLearningPlayback.occurredAt)).limit(200) : [];
      const latest=new Map<string,typeof playback[number]>();
      for(const item of playback) if(!latest.has(item.sessionId))latest.set(item.sessionId,item);
      return {choices,rooms:authorizedRooms.map(room=>({
        ...room,pairedLearners:counts.find(c=>c.id===room.id)?.total??0,
        latestPlayback:latest.get(room.id)??null,
        startedAt:room.startedAt.toISOString(),
        pairingExpiresAt:room.pairingExpiresAt.toISOString(),
        endedAt:room.endedAt?.toISOString()??null,
      })),asOf:now.toISOString(),note:"A paired learner is not a verified on-site attendee."};
    });
  });

export const startFacilitatedLearningRoom = createServerFn({method:"POST"})
  .validator((value:unknown)=>facilitatedStartSchema.parse(value))
  .handler(async({data})=>{
    privateResult();
    const host=await requireCanonicalLabProvider();
    return db.transaction(async tx=>{
      const access=await authorizedHostDeployment(tx,host,data.deploymentId);
      const [version]=await tx.select({id:courseVersions.id})
        .from(courseVersions).where(and(
          eq(courseVersions.id,data.courseVersionId),eq(courseVersions.lifecycle,"published"),
        )).limit(1);
      const [activeAttempt]=await tx.select({id:learnerCourseAttempts.id})
        .from(learnerCourseAttempts).where(and(
          eq(learnerCourseAttempts.deploymentId,data.deploymentId),
          eq(learnerCourseAttempts.courseVersionId,data.courseVersionId),
          eq(learnerCourseAttempts.status,"active"),
        )).limit(1);
      if(!version||!activeAttempt)throw new AuthorizationError("active published course for deployment");
      const code=generatePairingCode();
      const now=new Date();
      const [created]=await tx.insert(facilitatedLearningSessions).values({
        deploymentId:data.deploymentId, courseVersionId:data.courseVersionId,
        siteId:access.siteId, hostOrganizationId:host.organizationId,
        facilitatorPersonId:host.actor.actorPersonId!,
        pairingCodeDigest:digestCode(code),
        pairingExpiresAt:new Date(now.getTime()+facilitatedPairingWindowMs),
      }).returning({id:facilitatedLearningSessions.id});
      if(!created)throw new Error("Could not create facilitated room");
      return {facilitatedSessionId:created.id, pairingCode:displayCode(code),
        pairingExpiresAt:new Date(now.getTime()+facilitatedPairingWindowMs).toISOString()};
    });
  });

export const renewFacilitatedLearningPairing = createServerFn({method:"POST"})
  .validator((value:unknown)=>roomIdInput.parse(value))
  .handler(async({data})=>{
    privateResult();
    const host=await requireCanonicalLabProvider();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId,true);
      const now=new Date(); assertRoomLive(room,now);
      const code=generatePairingCode();
      const expiresAt=new Date(now.getTime()+facilitatedPairingWindowMs);
      await tx.update(facilitatedLearningSessions).set({
        pairingCodeDigest:digestCode(code),pairingExpiresAt:expiresAt,
      }).where(eq(facilitatedLearningSessions.id,room.id));
      return {facilitatedSessionId:room.id,pairingCode:displayCode(code),
        pairingExpiresAt:expiresAt.toISOString()};
    });
  });

export const endFacilitatedLearningRoom = createServerFn({method:"POST"})
  .validator((value:unknown)=>roomIdInput.parse(value))
  .handler(async({data})=>{
    privateResult();
    const host=await requireCanonicalLabProvider();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId,true);
      if(room.state==="ended")return {ended:true,alreadyEnded:true};
      await tx.update(facilitatedLearningSessions)
        .set({state:"ended",endedAt:new Date()})
        .where(eq(facilitatedLearningSessions.id,room.id));
      return {ended:true,alreadyEnded:false};
    });
  });

export const recordFacilitatedPlayback = createServerFn({method:"POST"})
  .validator((value:unknown)=>facilitatedPlaybackSchema.parse(value))
  .handler(async({data})=>{
    privateResult();
    const host=await requireCanonicalLabProvider();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId,true);
      assertRoomLive(room,new Date());
      await validateRoomVideo(tx,room.courseVersionId,data.lessonId,data.assetVersionId);
      const [existing]=await tx.select().from(facilitatedLearningPlayback)
        .where(and(
          eq(facilitatedLearningPlayback.facilitatedSessionId,room.id),
          eq(facilitatedLearningPlayback.requestId,data.requestId),
        )).limit(1);
      if(existing){
        if(existing.kind!==data.kind||existing.lessonId!==data.lessonId||
          existing.assetVersionId!==data.assetVersionId||
          existing.positionSeconds!==data.positionSeconds)
          throw new Error("Conflicting facilitated playback retry");
        return {recorded:true,duplicate:true};
      }
      const [saved]=await tx.insert(facilitatedLearningPlayback).values({
        facilitatedSessionId:room.id,courseVersionId:room.courseVersionId,
        facilitatorPersonId:host.actor.actorPersonId!,requestId:data.requestId,
        kind:data.kind,lessonId:data.lessonId,assetVersionId:data.assetVersionId,
        positionSeconds:data.positionSeconds,
      }).returning({id:facilitatedLearningPlayback.id});
      if(!saved)throw new Error("Unable to record facilitator playback");
      return {recorded:true,duplicate:false};
    });
  });

export const pairWithFacilitatedRoom = createServerFn({method:"POST"})
  .validator((value:unknown)=>joinInput.parse(value))
  .handler(async({data})=>{
    privateResult();
    const actor=await getInstructionalLearnerContext(getRequest());
    const personId=actor.actorPersonId;
    if(!personId||!["student","learner"].includes(actor.role??""))
      throw new AuthorizationError("authenticated course learner");
    const normalized=normalizeFacilitatedPairingCode(data.pairingCode);
    const codeHash=digestCode(normalized);
    return db.transaction(async tx=>{
      const attempt=await authorizeCanonicalCourseAttempt(tx,actor,data.courseAttemptId);
      const [room]=await tx.select().from(facilitatedLearningSessions)
        .where(eq(facilitatedLearningSessions.pairingCodeDigest,codeHash))
        .for("update").limit(1);
      const now=new Date();
      if(!room||!canPairFacilitatedLearning({
        sessionState:room.state,startedAt:room.startedAt,
        pairingExpiresAt:room.pairingExpiresAt,now,
        sessionDeploymentId:room.deploymentId,sessionCourseVersionId:room.courseVersionId,
        attemptDeploymentId:attempt.deploymentId,attemptCourseVersionId:attempt.courseVersionId,
      })) throw new AuthorizationError("valid current course pairing code");
      await tx.insert(facilitatedLearningParticipants).values({
        facilitatedSessionId:room.id,courseAttemptId:data.courseAttemptId,
        participantPersonId:personId,joinedAt:now,lastPairedAt:now,
      }).onConflictDoUpdate({
        target:[facilitatedLearningParticipants.facilitatedSessionId,
          facilitatedLearningParticipants.courseAttemptId],
        set:{lastPairedAt:now,leftAt:null},
      });
      return {facilitatedSessionId:room.id,paired:true,
        note:"This pairing records a learner's device connection, not attendance or verified watch time."};
    });
  });

export const leaveFacilitatedRoom = createServerFn({method:"POST"})
  .validator((value:unknown)=>leaveInput.parse(value))
  .handler(async({data})=>{
    privateResult();
    const actor=await getInstructionalLearnerContext(getRequest());
    if(!actor.actorPersonId)throw new AuthorizationError("authenticated learner");
    return db.transaction(async tx=>{
      await authorizeCanonicalCourseAttempt(tx,actor,data.courseAttemptId,true);
      const [saved]=await tx.update(facilitatedLearningParticipants).set({leftAt:new Date()})
        .where(and(
          eq(facilitatedLearningParticipants.facilitatedSessionId,data.facilitatedSessionId),
          eq(facilitatedLearningParticipants.courseAttemptId,data.courseAttemptId),
          eq(facilitatedLearningParticipants.participantPersonId,actor.actorPersonId!),
          isNull(facilitatedLearningParticipants.leftAt),
        )).returning({id:facilitatedLearningParticipants.id});
      return {left:!!saved};
    });
  });

export const getLearnerFacilitatedRoom = createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({courseAttemptId:z.string().uuid()}).strict().parse(value))
  .handler(async({data})=>{
    privateResult();
    const actor=await getInstructionalLearnerContext(getRequest());
    if(!actor.actorPersonId)throw new AuthorizationError("authenticated learner");
    return db.transaction(async tx=>{
      await authorizeCanonicalCourseAttempt(tx,actor,data.courseAttemptId,true);
      const rows=await tx.select({
        roomId:facilitatedLearningSessions.id,
        state:facilitatedLearningSessions.state,
        startedAt:facilitatedLearningSessions.startedAt,
        siteId:facilitatedLearningSessions.siteId,
        leftAt:facilitatedLearningParticipants.leftAt,
      }).from(facilitatedLearningParticipants)
        .innerJoin(facilitatedLearningSessions,eq(
          facilitatedLearningParticipants.facilitatedSessionId,facilitatedLearningSessions.id,
        ))
        .where(and(
          eq(facilitatedLearningParticipants.courseAttemptId,data.courseAttemptId),
          eq(facilitatedLearningParticipants.participantPersonId,actor.actorPersonId!),
          isNull(facilitatedLearningParticipants.leftAt),
          eq(facilitatedLearningSessions.state,"live"),
        )).orderBy(desc(facilitatedLearningSessions.startedAt)).limit(5);
      const recent=rows.filter(row=>
        Date.now()-row.startedAt.getTime()<=facilitatedRoomMaxMs);
      const ids=recent.map(row=>row.roomId);
      const events=ids.length?await tx.select({
        roomId:facilitatedLearningPlayback.facilitatedSessionId,
        kind:facilitatedLearningPlayback.kind,
        lessonId:facilitatedLearningPlayback.lessonId,
        assetVersionId:facilitatedLearningPlayback.assetVersionId,
        positionSeconds:facilitatedLearningPlayback.positionSeconds,
        occurredAt:facilitatedLearningPlayback.occurredAt,
      }).from(facilitatedLearningPlayback)
        .where(inArray(facilitatedLearningPlayback.facilitatedSessionId,ids))
        .orderBy(desc(facilitatedLearningPlayback.occurredAt)).limit(100):[];
      const latest=new Map<string,typeof events[number]>();
      for(const event of events) if(!latest.has(event.roomId))latest.set(event.roomId,event);
      return {rooms:recent.map(row=>({
        facilitatedSessionId:row.roomId,siteId:row.siteId,
        startedAt:row.startedAt.toISOString(),
        latestPlayback:latest.has(row.roomId)?{
          ...latest.get(row.roomId)!,
          occurredAt:latest.get(row.roomId)!.occurredAt.toISOString(),
        }:null,
      })),notice:"Pairing does not prove physical attendance or video consumption."};
    });
  });

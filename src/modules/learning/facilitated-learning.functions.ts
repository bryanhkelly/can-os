import { requireFacilitatedLearningEnabled } from "@/modules/learning/canonical-learning-release.server";
import { attemptInAssignedClassroomRelease } from "./classroom-release-boundary.server";
import { createServerFn } from "@tanstack/react-start";
import { digestCode, generatePairingCode, displayCode, recordRoomAuditAndEvent, roomHostIsCurrent, schoolAttemptIsPlacedAtSite, ownedRoom, assertRoomLive, currentRoomMediaAudience, assertRoomMediaRightsForAudience, assertAuthorizedFacilitatedRoomMedia, createFacilitatedRoomForHost, selfEnrolledNoncreditRoomSitePermitted } from "./facilitated-learning-operations.server";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, countDistinct, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents, catalogSites, canonicalAccounts, canonicalAccountGrants,
  contentAssets, contentAssetVersions, courseLessons, courseVersions, courses,
  enrollments, learnerProfiles, noncreditRegistrations, noncreditTrainingVersions,
  deploymentOfferingAdoptions, offeringVersions, classroomOfferingCourses,
  domainEvents,
  educationOperationOrganizationRoles,
  educationOperationSites, facilitatedLearningParticipants, facilitatedLearningPlayback,
  facilitatedPairingRateLimits,
  facilitatedLearningSessions, learnerCourseAttempts, programDeployments,
  classroomDeploymentSites, classroomEnrollmentSitePlacements,
  siteOrganizationRoles, trackLessonPresentations, noncreditSelfEnrollmentClaims,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { instructionalTrackAssetStorageKey } from "@/domain/instructional-tracks";
import { resolveClassVideo } from "@/domain/class-video";
import { signPrivateObjectUrl } from "@/platform/storage/r2";
import {
  canPairFacilitatedLearning, facilitatedCodeAlphabet, facilitatedCodeLength,
  facilitatedPairSchema, facilitatedPairingWindowMs, facilitatedPlaybackSchema,
  facilitatedRoomMaxMs, facilitatedStartSchema, normalizeFacilitatedPairingCode,
  nextFacilitatedPairingLimit, facilitatedRoomOperationalState, roomMediaAudienceEligible,
} from "@/domain/facilitated-learning";
import { requireCanonicalFacilitator } from "./canonical-facilitator-access.server";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "./canonical-course-participation.server";

const roomIdInput = z.object({ facilitatedSessionId: z.string().uuid() }).strict();
const joinInput = facilitatedPairSchema;
const leaveInput = z.object({
  facilitatedSessionId: z.string().uuid(), courseAttemptId: z.string().uuid(),
}).strict();
function privateResult() {
  setResponseHeader("Cache-Control", "private, no-store");
}
const roomMediaInput=roomIdInput.extend({
  lessonId:z.string().uuid(),assetVersionId:z.string().uuid(),
}).strict();
const protectedMediaKey=/^learning\/instructional-track\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Preview only the currently distributable, independently approved recordings
 * for the selected room. The private media URL is never included in this catalog.
 */
export const getFacilitatedRoomMedia = createServerFn({method:"GET"})
  .validator((value:unknown)=>roomIdInput.parse(value))
  .handler(async({data})=>{
    requireFacilitatedLearningEnabled();
    privateResult();
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId);
      assertRoomLive(room,new Date());
      const candidates=await tx.select({
        lessonId:courseLessons.id,lessonTitle:courseLessons.title,
        assetVersionId:trackLessonPresentations.assetVersionId,
        trackVersionId:trackLessonPresentations.trackVersionId,
      }).from(trackLessonPresentations).innerJoin(courseLessons,and(
        eq(courseLessons.id,trackLessonPresentations.courseLessonId),
        eq(courseLessons.courseVersionId,room.courseVersionId),
      )).where(eq(trackLessonPresentations.courseVersionId,room.courseVersionId))
        .orderBy(asc(courseLessons.lessonOrder)).limit(25);
      const audience = await currentRoomMediaAudience(tx, room);
      if (!audience.length) return {
        facilitatedSessionId:room.id, media:[] as typeof candidates, truncated:false,
        note:"Ask at least one eligible learner to pair a device before playing shared-screen instruction.",
      };
      const approved:typeof candidates=[];
      for(const candidate of candidates){
        try {
          await assertRoomMediaRightsForAudience(
            tx, audience, candidate.trackVersionId, candidate.lessonId, candidate.assetVersionId,
          );
          approved.push(candidate);
        }catch(error){
          if(!(error instanceof AuthorizationError) && !(error instanceof DomainError))
            throw error;
        }
      }
      return {facilitatedSessionId:room.id,media:approved,
        truncated:candidates.length===25,
        note:"Only current authorized instructional track recordings appear."};
    });
  });

/** Facilitators can stream only recordings that pass the SAME track review,
 * rights, publication-manifest and withdrawal guards as the learner player.
 */
export const getFacilitatedRoomMediaAccess = createServerFn({method:"POST"})
  .validator((value:unknown)=>roomMediaInput.parse(value))
  .handler(async({data})=>{
    requireFacilitatedLearningEnabled();
    privateResult();
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId);
      await assertAuthorizedFacilitatedRoomMedia(
        tx, room, data.lessonId, data.assetVersionId,
      );
      const [asset]=await tx.select({
        storageReference:contentAssetVersions.storageReference,
        externalUrl:contentAssets.externalUrl,
      }).from(contentAssetVersions)
        .innerJoin(contentAssets,eq(
          contentAssets.id,contentAssetVersions.assetId,
        ))
        .where(and(
          eq(contentAssetVersions.id,data.assetVersionId),
          eq(contentAssetVersions.lifecycle,"published"),
        )).limit(1);
      if(!asset) throw new AuthorizationError("approved video resource");
      const expectedKey=instructionalTrackAssetStorageKey(data.assetVersionId);
      if(asset.storageReference===expectedKey && protectedMediaKey.test(expectedKey))
        return {downloadUrl:signPrivateObjectUrl({
          method:"GET",key:expectedKey,
          keyPattern:protectedMediaKey,expiresSeconds:30,
        }),expiresInSeconds:30};
      // Only canonical YouTube/Vimeo embeds are permitted, and only after the
      // SAME Site/adoption rights check used for private R2 recordings.
      if(asset.externalUrl && resolveClassVideo(asset.externalUrl)?.kind==="embed")
        return {downloadUrl:asset.externalUrl,expiresInSeconds:0};
      throw new AuthorizationError("approved private video or allowlisted provider embed");
    });
  });

export const getFacilitatedHostWorkspace = createServerFn({method:"GET"})
  .handler(async()=>{
    requireFacilitatedLearningEnabled();
    privateResult();
    const host = await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const now = new Date();
      // Query only currently authorized Site/deployment relationships; do not
      // iterate across unrelated organizations' deployments to discover access.
      const visible = await tx.selectDistinct({
        deploymentId:programDeployments.id,
        deploymentName:programDeployments.name,
        siteId:educationOperationSites.siteId,
      }).from(programDeployments)
        .innerJoin(educationOperationOrganizationRoles,and(
          eq(educationOperationOrganizationRoles.operationId,programDeployments.operationId),
          eq(educationOperationOrganizationRoles.organizationId,host.organizationId),
          eq(educationOperationOrganizationRoles.roleCode,"operator"),
          eq(educationOperationOrganizationRoles.status,"approved"),
          lte(educationOperationOrganizationRoles.validFrom,now),
          or(isNull(educationOperationOrganizationRoles.validThrough),
            gt(educationOperationOrganizationRoles.validThrough,now)),
        ))
        .innerJoin(educationOperationSites,and(
          eq(educationOperationSites.operationId,programDeployments.operationId),
          inArray(educationOperationSites.siteId,host.siteIds),
          lte(educationOperationSites.validFrom,now),
          or(isNull(educationOperationSites.validThrough),
            gt(educationOperationSites.validThrough,now)),
        ))
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
        .where(eq(programDeployments.status,"active"))
        .orderBy(asc(programDeployments.name)).limit(100);
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
      const choices=versions.flatMap(version=>visible.filter(row=>
        row.deploymentId===version.deploymentId,
      ).map(site=>({...version,siteId:site.siteId,deploymentName:site.deploymentName})));
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
        ...room,
        state: facilitatedRoomOperationalState(room, now),
        expiresAt: new Date(room.startedAt.getTime() + facilitatedRoomMaxMs).toISOString(),
        pairedLearners:counts.find(c=>c.id===room.id)?.total??0,
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
    requireFacilitatedLearningEnabled();
    privateResult();
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>createFacilitatedRoomForHost(tx,host,data));
  });

export const renewFacilitatedLearningPairing = createServerFn({method:"POST"})
  .validator((value:unknown)=>roomIdInput.parse(value))
  .handler(async({data})=>{
    requireFacilitatedLearningEnabled();
    privateResult();
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId,true);
      const now=new Date(); assertRoomLive(room,now);
      const code=generatePairingCode();
      const expiresAt=new Date(Math.min(
        now.getTime()+facilitatedPairingWindowMs,
        room.startedAt.getTime()+facilitatedRoomMaxMs,
      ));
      await tx.update(facilitatedLearningSessions).set({
        pairingCodeDigest:digestCode(code),pairingExpiresAt:expiresAt,
      }).where(eq(facilitatedLearningSessions.id,room.id));
      await recordRoomAuditAndEvent(tx,{
        actorPersonId:host.actor.actorPersonId!,organizationId:host.organizationId,
        eventCode:"learning.facilitated.pairing.renewed",eventType:"FacilitatedLearningPairingRenewed",
        sessionId:room.id,payload:{pairingExpiresAt:expiresAt.toISOString()},
      });
      return {facilitatedSessionId:room.id,pairingCode:displayCode(code),
        pairingExpiresAt:expiresAt.toISOString()};
    });
  });

export const endFacilitatedLearningRoom = createServerFn({method:"POST"})
  .validator((value:unknown)=>roomIdInput.parse(value))
  .handler(async({data})=>{
    requireFacilitatedLearningEnabled();
    privateResult();
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId,true);
      if(room.state==="ended")return {ended:true,alreadyEnded:true};
      await tx.update(facilitatedLearningSessions)
        .set({state:"ended",endedAt:new Date()})
        .where(eq(facilitatedLearningSessions.id,room.id));
      await recordRoomAuditAndEvent(tx,{
        actorPersonId:host.actor.actorPersonId!,organizationId:host.organizationId,
        eventCode:"learning.facilitated.room.ended",eventType:"FacilitatedLearningRoomEnded",
        sessionId:room.id,payload:{fromState:"live"},
      });
      return {ended:true,alreadyEnded:false};
    });
  });

export const recordFacilitatedPlayback = createServerFn({method:"POST"})
  .validator((value:unknown)=>facilitatedPlaybackSchema.parse(value))
  .handler(async({data})=>{
    requireFacilitatedLearningEnabled();
    privateResult();
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId,true);
      await assertAuthorizedFacilitatedRoomMedia(
        tx, room, data.lessonId, data.assetVersionId,
      );
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
    requireFacilitatedLearningEnabled();
    privateResult();
    const actor=await getInstructionalLearnerContext(getRequest());
    const personId=actor.actorPersonId;
    if(!personId||!["student","learner"].includes(actor.role??""))
      throw new AuthorizationError("authenticated course learner");
    const normalized=normalizeFacilitatedPairingCode(data.pairingCode);
    const codeHash=digestCode(normalized);
    // Denials are returned (rather than thrown) inside the transaction to
    // commit the rate-limit counter even when the pairing code is invalid.
    const paired=await db.transaction(async tx=>{
      const attempt=await authorizeCanonicalCourseAttempt(tx,actor,data.courseAttemptId);
      const now=new Date();
      await tx.insert(facilitatedPairingRateLimits).values({
        participantPersonId:personId,windowStartedAt:now,attemptCount:0,updatedAt:now,
      }).onConflictDoNothing();
      const [limit]=await tx.select().from(facilitatedPairingRateLimits)
        .where(eq(facilitatedPairingRateLimits.participantPersonId,personId))
        .for("update").limit(1);
      if(!limit)throw new Error("Pairing rate-limit record unavailable");
      const decision=nextFacilitatedPairingLimit({
        attempts:limit.attemptCount,windowStartedAt:limit.windowStartedAt,
        blockedUntil:limit.blockedUntil,now,
      });
      await tx.update(facilitatedPairingRateLimits).set({
        windowStartedAt:decision.windowStartedAt,attemptCount:decision.attempts,
        blockedUntil:decision.blockedUntil,updatedAt:now,
      }).where(eq(facilitatedPairingRateLimits.participantPersonId,personId));
      if(!decision.allowed)return null;
      const [room]=await tx.select().from(facilitatedLearningSessions)
        .where(eq(facilitatedLearningSessions.pairingCodeDigest,codeHash))
        .for("update").limit(1);
      if(!room || !canPairFacilitatedLearning({
        sessionState:room.state,startedAt:room.startedAt,
        pairingExpiresAt:room.pairingExpiresAt,now,
        sessionDeploymentId:room.deploymentId,sessionCourseVersionId:room.courseVersionId,
        attemptDeploymentId:attempt.deploymentId,attemptCourseVersionId:attempt.courseVersionId,
      }))return null;
      // Denials return null so the per-person rate limiter still commits.
      if (!await roomHostIsCurrent(tx,room,now)) return null;
      if (attempt.source==="school" && !await schoolAttemptIsPlacedAtSite(
        tx,attempt.courseAttemptId,room.deploymentId,room.siteId,now,
      )) return null;
      if (!await selfEnrolledNoncreditRoomSitePermitted(tx,attempt,room.siteId)) return null;
      if(!await attemptInAssignedClassroomRelease(
        tx,room,attempt.courseAttemptId,personId,
      )) return null;
      await tx.insert(facilitatedLearningParticipants).values({
        facilitatedSessionId:room.id,courseAttemptId:data.courseAttemptId,
        participantPersonId:personId,joinedAt:now,lastPairedAt:now,
      }).onConflictDoUpdate({
        target:[facilitatedLearningParticipants.facilitatedSessionId,
          facilitatedLearningParticipants.courseAttemptId],
        set:{lastPairedAt:now,leftAt:null},
      });
      await recordRoomAuditAndEvent(tx,{
        actorPersonId:personId,organizationId:room.hostOrganizationId,
        eventCode:"learning.facilitated.room.paired",
        eventType:"FacilitatedLearningRoomPaired",sessionId:room.id,
        payload:{courseAttemptId:data.courseAttemptId},
      });
      return {facilitatedSessionId:room.id,paired:true,
        note:"Pairing records a device connection, not attendance or verified watch time."};
    });
    if(!paired)throw new AuthorizationError("valid current course pairing code");
    return paired;
  });

export const leaveFacilitatedRoom = createServerFn({method:"POST"})
  .validator((value:unknown)=>leaveInput.parse(value))
  .handler(async({data})=>{
    requireFacilitatedLearningEnabled();
    privateResult();
    const actor=await getInstructionalLearnerContext(getRequest());
    if(!actor.actorPersonId)throw new AuthorizationError("authenticated learner");
    return db.transaction(async tx=>{
      await authorizeCanonicalCourseAttempt(tx,actor,data.courseAttemptId,true);
      const [room]=await tx.select({
        hostOrganizationId:facilitatedLearningSessions.hostOrganizationId,
      }).from(facilitatedLearningSessions)
        .where(eq(facilitatedLearningSessions.id,data.facilitatedSessionId)).limit(1);
      if(!room)return {left:false};
      const [saved]=await tx.update(facilitatedLearningParticipants).set({leftAt:new Date()})
        .where(and(
          eq(facilitatedLearningParticipants.facilitatedSessionId,data.facilitatedSessionId),
          eq(facilitatedLearningParticipants.courseAttemptId,data.courseAttemptId),
          eq(facilitatedLearningParticipants.participantPersonId,actor.actorPersonId!),
          isNull(facilitatedLearningParticipants.leftAt),
        )).returning({id:facilitatedLearningParticipants.id});
      if(saved)await recordRoomAuditAndEvent(tx,{
        actorPersonId:actor.actorPersonId!,organizationId:room.hostOrganizationId,
        eventCode:"learning.facilitated.room.left",
        eventType:"FacilitatedLearningRoomLeft",
        sessionId:data.facilitatedSessionId,
        payload:{courseAttemptId:data.courseAttemptId},
      });
      return {left:!!saved};
    });
  });

export const getLearnerFacilitatedRoom = createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({courseAttemptId:z.string().uuid()}).strict().parse(value))
  .handler(async({data})=>{
    requireFacilitatedLearningEnabled();
    privateResult();
    const actor=await getInstructionalLearnerContext(getRequest());
    if(!actor.actorPersonId)throw new AuthorizationError("authenticated learner");
    return db.transaction(async tx=>{
      const access=await authorizeCanonicalCourseAttempt(tx,actor,data.courseAttemptId);
      const now=new Date();
      const rows=await tx.select({
        roomId:facilitatedLearningSessions.id,
        state:facilitatedLearningSessions.state,
        startedAt:facilitatedLearningSessions.startedAt,
        siteId:facilitatedLearningSessions.siteId,
        deploymentId:facilitatedLearningSessions.deploymentId,
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
      const recent:typeof rows=[];
      for(const row of rows) {
        if(row.startedAt>now || now.getTime()-row.startedAt.getTime()>facilitatedRoomMaxMs)continue;
        // A revoked Site relationship or moved school learner must lose access
        // to subsequent shared-room status, not merely new pairing attempts.
        const [room]=await tx.select().from(facilitatedLearningSessions)
          .where(eq(facilitatedLearningSessions.id,row.roomId)).limit(1);
        if(!room || !await roomHostIsCurrent(tx,room,now))continue;
        if(access.source==="school" && !await schoolAttemptIsPlacedAtSite(
          tx,access.courseAttemptId,row.deploymentId,row.siteId,now,
        ))continue;
        if(!await selfEnrolledNoncreditRoomSitePermitted(tx,access,row.siteId))continue;
        if(!await attemptInAssignedClassroomRelease(
          tx,room,access.courseAttemptId,actor.actorPersonId!,
        ))continue;
        recent.push(row);
      }
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

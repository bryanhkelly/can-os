import { requireFacilitatedLearningEnabled } from "@/modules/learning/canonical-learning-release.server";
import { randomInt, createHmac } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, countDistinct, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  catalogSites, contentAssetVersions, courseLessons, courseVersions, courses,
  educationOperationOrganizationRoles,
  educationOperationSites, facilitatedLearningParticipants, facilitatedLearningPlayback,
  facilitatedPairingRateLimits,
  facilitatedLearningSessions, learnerCourseAttempts, programDeployments,
  siteOrganizationRoles, trackLessonPresentations,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { instructionalTrackAssetStorageKey } from "@/domain/instructional-tracks";
import { signPrivateObjectUrl } from "@/platform/storage/r2";
import { assertFacilitatedInstructionalDelivery } from "./student-instructional-tracks.server";
import {
  canPairFacilitatedLearning, facilitatedCodeAlphabet, facilitatedCodeLength,
  facilitatedPairSchema, facilitatedPairingWindowMs, facilitatedPlaybackSchema,
  facilitatedRoomMaxMs, facilitatedStartSchema, normalizeFacilitatedPairingCode,
  nextFacilitatedPairingLimit,
} from "@/domain/facilitated-learning";
import { requireCanonicalFacilitator } from "./canonical-facilitator-access.server";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "./canonical-course-participation.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Host = Awaited<ReturnType<typeof requireCanonicalFacilitator>>;
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
async function authorizedHostDeployment(tx: Tx, host: Host, deploymentId: string, requiredSiteId?: string) {
  const now = new Date();
  const [deployment] = await tx.select({
    id: programDeployments.id, operationId: programDeployments.operationId,
    name: programDeployments.name, status: programDeployments.status,
  }).from(programDeployments).where(eq(programDeployments.id, deploymentId)).limit(1);
  if (!deployment || deployment.status !== "active")
    throw new AuthorizationError("active deployment");
  const [operatingRelationship] = await tx.select({id:educationOperationOrganizationRoles.id})
    .from(educationOperationOrganizationRoles).where(and(
      eq(educationOperationOrganizationRoles.operationId,deployment.operationId),
      eq(educationOperationOrganizationRoles.organizationId,host.organizationId),
      eq(educationOperationOrganizationRoles.roleCode,"operator"),
      eq(educationOperationOrganizationRoles.status,"approved"),
      lte(educationOperationOrganizationRoles.validFrom,now),
      or(isNull(educationOperationOrganizationRoles.validThrough),
        gt(educationOperationOrganizationRoles.validThrough,now)),
    )).limit(1);
  if (!operatingRelationship)
    throw new AuthorizationError("approved operator relationship for deployment");
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
      ...(requiredSiteId ? [eq(educationOperationSites.siteId,requiredSiteId)] : []),
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
  const access = await authorizedHostDeployment(tx,host,room.deploymentId,room.siteId);
  if(access.siteId!==room.siteId) throw new AuthorizationError("current Site hosting authority");
  return room;
}
function assertRoomLive(room: typeof facilitatedLearningSessions.$inferSelect, now:Date) {
  if(room.state!=="live" || room.endedAt || room.startedAt>now ||
    now.getTime()-room.startedAt.getTime()>facilitatedRoomMaxMs)
    throw new AuthorizationError("current facilitated room");
}
async function validateRoomVideo(tx: Tx, courseVersionId:string, lessonId:string,assetVersionId:string) {
  const [presentation] = await tx.select({
    id:trackLessonPresentations.id,
    trackVersionId:trackLessonPresentations.trackVersionId,
  })
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
  return presentation.trackVersionId;
}

/** Permission checks for a room use a real active Course attempt with a current
 * Deployment adoption, never a fabricated facilitator enrollment. */
async function representativeAttempt(tx: Tx, deploymentId:string, courseVersionId:string) {
  const [attempt] = await tx.select().from(learnerCourseAttempts).where(and(
    eq(learnerCourseAttempts.deploymentId,deploymentId),
    eq(learnerCourseAttempts.courseVersionId,courseVersionId),
    eq(learnerCourseAttempts.status,"active"),
  )).limit(1);
  if(!attempt) throw new AuthorizationError("active registered course delivery");
  return attempt;
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
      const attempt=await representativeAttempt(tx,room.deploymentId,room.courseVersionId);
      const candidates=await tx.select({
        lessonId:courseLessons.id,lessonTitle:courseLessons.title,
        assetVersionId:trackLessonPresentations.assetVersionId,
        trackVersionId:trackLessonPresentations.trackVersionId,
      }).from(trackLessonPresentations).innerJoin(courseLessons,and(
        eq(courseLessons.id,trackLessonPresentations.courseLessonId),
        eq(courseLessons.courseVersionId,room.courseVersionId),
      )).where(eq(trackLessonPresentations.courseVersionId,room.courseVersionId))
        .orderBy(asc(courseLessons.lessonOrder)).limit(25);
      const approved:typeof candidates=[];
      for(const candidate of candidates){
        try {
          await assertFacilitatedInstructionalDelivery(
            tx,attempt,candidate.trackVersionId,candidate.lessonId,candidate.assetVersionId,
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
      assertRoomLive(room,new Date());
      const trackVersionId=await validateRoomVideo(
        tx,room.courseVersionId,data.lessonId,data.assetVersionId,
      );
      const attempt=await representativeAttempt(tx,room.deploymentId,room.courseVersionId);
      await assertFacilitatedInstructionalDelivery(
        tx,attempt,trackVersionId,data.lessonId,data.assetVersionId,
      );
      const [asset]=await tx.select({
        storageReference:contentAssetVersions.storageReference,
      }).from(contentAssetVersions).where(and(
        eq(contentAssetVersions.id,data.assetVersionId),
        eq(contentAssetVersions.lifecycle,"published"),
      )).limit(1);
      const expectedKey=instructionalTrackAssetStorageKey(data.assetVersionId);
      if(!asset||asset.storageReference!==expectedKey||
        !protectedMediaKey.test(asset.storageReference))
        throw new AuthorizationError("approved private video resource");
      return {downloadUrl:signPrivateObjectUrl({
        method:"GET",key:asset.storageReference,
        keyPattern:protectedMediaKey,expiresSeconds:30,
      }),expiresInSeconds:30};
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
    requireFacilitatedLearningEnabled();
    privateResult();
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const access=await authorizedHostDeployment(tx,host,data.deploymentId,data.siteId);
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
    requireFacilitatedLearningEnabled();
    privateResult();
    const host=await requireCanonicalFacilitator();
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
    requireFacilitatedLearningEnabled();
    privateResult();
    const host=await requireCanonicalFacilitator();
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
    requireFacilitatedLearningEnabled();
    privateResult();
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId,true);
      assertRoomLive(room,new Date());
      const trackVersionId=await validateRoomVideo(
        tx,room.courseVersionId,data.lessonId,data.assetVersionId,
      );
      const attempt=await representativeAttempt(tx,room.deploymentId,room.courseVersionId);
      await assertFacilitatedInstructionalDelivery(
        tx,attempt,trackVersionId,data.lessonId,data.assetVersionId,
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
      await tx.insert(facilitatedLearningParticipants).values({
        facilitatedSessionId:room.id,courseAttemptId:data.courseAttemptId,
        participantPersonId:personId,joinedAt:now,lastPairedAt:now,
      }).onConflictDoUpdate({
        target:[facilitatedLearningParticipants.facilitatedSessionId,
          facilitatedLearningParticipants.courseAttemptId],
        set:{lastPairedAt:now,leftAt:null},
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
    requireFacilitatedLearningEnabled();
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

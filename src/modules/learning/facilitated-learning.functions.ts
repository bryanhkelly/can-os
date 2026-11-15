import { requireFacilitatedLearningEnabled } from "@/modules/learning/canonical-learning-release.server";
import { attemptInAssignedClassroomRelease } from "./classroom-release-boundary.server";
import { randomInt, createHmac } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
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

/**
 * Canonical audit + domain-event pair for facilitated room lifecycle actions,
 * following the noncredit completion convention. Audit rows carry the host
 * organization; domain events stay reprocessable through the outbox.
 */
async function recordRoomAuditAndEvent(
  tx: Tx,
  input: {
    actorPersonId: string;
    organizationId: string;
    eventCode: string;
    eventType: string;
    sessionId: string;
    payload: Record<string, string>;
  },
) {
  await tx.insert(auditEvents).values({
    actorPersonId: input.actorPersonId,
    owningOrganizationId: input.organizationId,
    eventCode: input.eventCode,
    entityKind: "facilitated_learning_session",
    entityId: input.sessionId,
    payload: input.payload,
  });
  await tx.insert(domainEvents).values({
    eventType: input.eventType,
    aggregateType: "facilitated_learning_session",
    aggregateId: input.sessionId,
    actorPersonId: input.actorPersonId,
    payload: input.payload,
  });
}

/** A site membership is not enough. Require an active operation-site relationship
 * AND a current host/operator organization relationship at that same Site.
 * A separate network/denomination affiliation is never required.
 */
export async function authorizedHostDeployment(tx: Tx, host: Host, deploymentId: string, requiredSiteId?: string) {
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
/**
 * Recheck current hosting and school placement on every pairing/read, including
 * after a facilitator or Site relationship has been withdrawn. Failed checks
 * disclose neither the room nor its playback activity to a learner.
 */
export async function roomHostIsCurrent(tx:Tx, room:typeof facilitatedLearningSessions.$inferSelect, now:Date) {
  const [host] = await tx.select({id:educationOperationSites.siteId})
    .from(programDeployments)
    .innerJoin(educationOperationOrganizationRoles,and(
      eq(educationOperationOrganizationRoles.operationId,programDeployments.operationId),
      eq(educationOperationOrganizationRoles.organizationId,room.hostOrganizationId),
      eq(educationOperationOrganizationRoles.roleCode,"operator"),
      eq(educationOperationOrganizationRoles.status,"approved"),
      lte(educationOperationOrganizationRoles.validFrom,now),
      or(isNull(educationOperationOrganizationRoles.validThrough),
        gt(educationOperationOrganizationRoles.validThrough,now)),
    ))
    .innerJoin(educationOperationSites,and(
      eq(educationOperationSites.operationId,programDeployments.operationId),
      eq(educationOperationSites.siteId,room.siteId),
      lte(educationOperationSites.validFrom,now),
      or(isNull(educationOperationSites.validThrough),
        gt(educationOperationSites.validThrough,now)),
    ))
    .innerJoin(siteOrganizationRoles,and(
      eq(siteOrganizationRoles.siteId,room.siteId),
      eq(siteOrganizationRoles.organizationId,room.hostOrganizationId),
      inArray(siteOrganizationRoles.roleCode,["operator","host"]),
      lte(siteOrganizationRoles.validFrom,now),
      or(isNull(siteOrganizationRoles.validThrough),gt(siteOrganizationRoles.validThrough,now)),
    ))
    .innerJoin(catalogSites,and(
      eq(catalogSites.id,room.siteId),eq(catalogSites.status,"active"),
    ))
    .where(and(
      eq(programDeployments.id,room.deploymentId),
      eq(programDeployments.status,"active"),
    )).limit(1);
  if(!host)return false;
  // Room ownership alone does not preserve a revoked facilitator's ability
  // to recruit or expose learner activity after their native grant is removed.
  const [grant] = await tx.select({id:canonicalAccountGrants.id})
    .from(canonicalAccountGrants)
    .innerJoin(canonicalAccounts,and(
      eq(canonicalAccounts.id,canonicalAccountGrants.accountId),
      isNull(canonicalAccounts.disabledAt),
    ))
    .where(and(
      eq(canonicalAccountGrants.personId,room.facilitatorPersonId),
      eq(canonicalAccountGrants.organizationId,room.hostOrganizationId),
      eq(canonicalAccountGrants.siteId,room.siteId),
      inArray(canonicalAccountGrants.roleCode,["room_facilitator","site_admin","registrar"]),
      eq(canonicalAccountGrants.active,true),
      isNull(canonicalAccountGrants.revokedAt),
    )).limit(1);
  return !!grant;
}
export async function schoolAttemptIsPlacedAtSite(
  tx:Tx, courseAttemptId:string, deploymentId:string, siteId:string, now:Date,
) {
  const [placement] = await tx.select({id:classroomEnrollmentSitePlacements.id})
    .from(classroomEnrollmentSitePlacements)
    .innerJoin(classroomDeploymentSites,and(
      eq(classroomDeploymentSites.id,classroomEnrollmentSitePlacements.deploymentSiteId),
      eq(classroomDeploymentSites.deploymentId,deploymentId),
      eq(classroomDeploymentSites.siteId,siteId),
    ))
    .innerJoin(learnerCourseAttempts,and(
      eq(learnerCourseAttempts.enrollmentId,classroomEnrollmentSitePlacements.enrollmentId),
      eq(learnerCourseAttempts.deploymentId,classroomEnrollmentSitePlacements.deploymentId),
    ))
    .where(and(
      eq(learnerCourseAttempts.id,courseAttemptId),
      eq(classroomEnrollmentSitePlacements.deploymentId,deploymentId),
      lte(classroomEnrollmentSitePlacements.startsAt,now),
      or(isNull(classroomEnrollmentSitePlacements.endsAt),
        gt(classroomEnrollmentSitePlacements.endsAt,now)),
    )).limit(1);
  return !!placement;
}
export async function ownedRoom(tx:Tx, host:Host, id:string, lock=false) {
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
  if(facilitatedRoomOperationalState(room,now)!=="live")
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

/**
 * Every active device currently paired to this room must still be allowed
 * this recording under its OWN Course adoption, not a random learner anywhere
 * in the Deployment. A school learner must be CURRENTLY placed at this Site.
 * Remote noncredit participants use their own current registration instead.
 *
 * A room without a paired audience may be opened and advertised, but cannot
 * obtain private video URLs or record playback until an authorized learner pairs.
 * A withdrawn/relocated paired learner blocks playback until the room audience
 * is reconciled; we never silently skip an ineligible connected device.
 */
async function currentRoomMediaAudience(
  tx: Tx,
  room: typeof facilitatedLearningSessions.$inferSelect,
): Promise<Array<typeof learnerCourseAttempts.$inferSelect>> {
  const paired = await tx.select({
    attempt: learnerCourseAttempts,
    participantPersonId: facilitatedLearningParticipants.participantPersonId,
  }).from(facilitatedLearningParticipants)
    .innerJoin(learnerCourseAttempts, eq(
      learnerCourseAttempts.id, facilitatedLearningParticipants.courseAttemptId,
    ))
    .where(and(
      eq(facilitatedLearningParticipants.facilitatedSessionId, room.id),
      isNull(facilitatedLearningParticipants.leftAt),
    )).limit(501);
  if (paired.length > 500)
    throw new AuthorizationError("bounded active room audience required for media");
  const now = new Date();
  const eligibleAdoptions = new Map<string, typeof learnerCourseAttempts.$inferSelect>();
  for (const { attempt, participantPersonId } of paired) {
    let sourceCurrent = false;
    let currentRoomSitePlacement = false;
    if (Boolean(attempt.enrollmentId) === Boolean(attempt.noncreditRegistrationId))
      throw new AuthorizationError("single current Course participation source");
    if (attempt.enrollmentId) {
      const [school] = await tx.select({ id: enrollments.id }).from(enrollments)
        .innerJoin(learnerProfiles, eq(enrollments.learnerId, learnerProfiles.id))
        .where(and(
          eq(enrollments.id, attempt.enrollmentId),
          eq(enrollments.deploymentId, room.deploymentId),
          eq(enrollments.status, "active"),
          eq(learnerProfiles.personId, participantPersonId),
        )).limit(1);
      sourceCurrent = !!school;
      if (sourceCurrent) currentRoomSitePlacement = await schoolAttemptIsPlacedAtSite(
        tx, attempt.id, room.deploymentId, room.siteId, now,
      );
    } else if (attempt.noncreditRegistrationId) {
      const [registration] = await tx.select({ id: noncreditRegistrations.id })
        .from(noncreditRegistrations)
        .innerJoin(noncreditTrainingVersions, and(
          eq(noncreditTrainingVersions.id, noncreditRegistrations.trainingVersionId),
          eq(noncreditTrainingVersions.offeringVersionId, attempt.offeringVersionId),
          eq(noncreditTrainingVersions.state, "published"),
        ))
        .where(and(
          eq(noncreditRegistrations.id, attempt.noncreditRegistrationId),
          eq(noncreditRegistrations.deploymentId, room.deploymentId),
          eq(noncreditRegistrations.adoptionId, attempt.adoptionId),
          eq(noncreditRegistrations.offeringVersionId, attempt.offeringVersionId),
          eq(noncreditRegistrations.participantPersonId, participantPersonId),
          inArray(noncreditRegistrations.status, ["registered", "active"]),
        )).limit(1);
      sourceCurrent = !!registration;
    }
    if(!await attemptInAssignedClassroomRelease(
      tx,room,attempt.id,participantPersonId,
    ))throw new AuthorizationError("current enrolled audience in linked cohort");
    if (!roomMediaAudienceEligible({
      roomDeploymentId: room.deploymentId,
      roomCourseVersionId: room.courseVersionId,
      attemptDeploymentId: attempt.deploymentId,
      attemptCourseVersionId: attempt.courseVersionId,
      attemptStatus: attempt.status,
      sourceCurrent,
      schoolAttempt: !!attempt.enrollmentId,
      currentRoomSitePlacement,
    })) throw new AuthorizationError("current registered audience at hosting Site");

    // A distinct adoption is sufficient to represent an identical delivery
    // policy; every paired Person is still checked for current eligibility.
    if (!eligibleAdoptions.has(attempt.adoptionId)) {
      const [approved] = await tx.select({ id: deploymentOfferingAdoptions.id })
        .from(deploymentOfferingAdoptions)
        .innerJoin(offeringVersions, and(
          eq(offeringVersions.id, deploymentOfferingAdoptions.offeringVersionId),
          eq(offeringVersions.lifecycle, "published"),
        ))
        .innerJoin(classroomOfferingCourses, and(
          eq(classroomOfferingCourses.offeringVersionId, offeringVersions.id),
          eq(classroomOfferingCourses.courseVersionId, attempt.courseVersionId),
        ))
        .where(and(
          eq(deploymentOfferingAdoptions.id, attempt.adoptionId),
          eq(deploymentOfferingAdoptions.deploymentId, room.deploymentId),
          eq(deploymentOfferingAdoptions.offeringVersionId, attempt.offeringVersionId),
          eq(deploymentOfferingAdoptions.approvalStatus, "approved"),
          lte(deploymentOfferingAdoptions.validFrom, now),
          or(isNull(deploymentOfferingAdoptions.validThrough),
            gt(deploymentOfferingAdoptions.validThrough, now)),
        )).limit(1);
      if (!approved) throw new AuthorizationError("current approved Course adoption");
    }
    eligibleAdoptions.set(attempt.adoptionId, attempt);
  }
  return [...eligibleAdoptions.values()];
}

async function assertRoomMediaRightsForAudience(
  tx: Tx, audience: Array<typeof learnerCourseAttempts.$inferSelect>,
  trackVersionId: string, lessonId: string, assetVersionId: string,
): Promise<void> {
  // Load the protected track-rights implementation inside the server-side
  // authorization path, not as a client-reachable module-level import.
  const { assertFacilitatedInstructionalDelivery } = await import("./student-instructional-tracks.server");
  // All current adoptions must independently permit this asset. Sharing a
  // Course version never implies identical policies or content rights.
  for (const attempt of audience) {
    await assertFacilitatedInstructionalDelivery(
      tx, attempt, trackVersionId, lessonId, assetVersionId,
    );
  }
}
/** Apply the same room/asset/audience authorization to remote projector controls,
 * signed media URLs and recorded playback evidence. Never authorize through an
 * unrelated active learner in the Deployment. */
export async function assertAuthorizedFacilitatedRoomMedia(
  tx: Tx,
  room: typeof facilitatedLearningSessions.$inferSelect,
  lessonId: string,
  assetVersionId: string,
): Promise<void> {
  assertRoomLive(room, new Date());
  const trackVersionId = await validateRoomVideo(
    tx, room.courseVersionId, lessonId, assetVersionId,
  );
  const audience = await currentRoomMediaAudience(tx, room);
  if (!audience.length) throw new AuthorizationError("paired current learner required for playback");
  await assertRoomMediaRightsForAudience(tx, audience, trackVersionId, lessonId, assetVersionId);
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

/** Shared atomic native room start. The scheduling path and the immediate-start
 * path both execute exactly this audit, Site and course authorization logic.
 * Called only after requireCanonicalFacilitator() under the transaction.
 */
export async function createFacilitatedRoomForHost(
  tx: Tx, host: Host,
  data: {deploymentId:string;courseVersionId:string;siteId:string},
) {
  const access=await authorizedHostDeployment(tx,host,data.deploymentId,data.siteId);
  const [version]=await tx.select({id:courseVersions.id})
    .from(courseVersions).where(and(
      eq(courseVersions.id,data.courseVersionId),
      eq(courseVersions.lifecycle,"published"),
    )).limit(1);
  const [activeAttempt]=await tx.select({id:learnerCourseAttempts.id})
    .from(learnerCourseAttempts).where(and(
      eq(learnerCourseAttempts.deploymentId,data.deploymentId),
      eq(learnerCourseAttempts.courseVersionId,data.courseVersionId),
      eq(learnerCourseAttempts.status,"active"),
    )).limit(1);
  if(!version||!activeAttempt)
    throw new AuthorizationError("active published course for deployment");
  const code=generatePairingCode();
  const now=new Date();
  const pairingExpiresAt=new Date(now.getTime()+facilitatedPairingWindowMs);
  const [created]=await tx.insert(facilitatedLearningSessions).values({
    deploymentId:data.deploymentId,courseVersionId:data.courseVersionId,
    siteId:access.siteId,hostOrganizationId:host.organizationId,
    facilitatorPersonId:host.actor.actorPersonId!,
    pairingCodeDigest:digestCode(code),pairingExpiresAt,
  }).returning({id:facilitatedLearningSessions.id});
  if(!created)throw new Error("Could not create facilitated room");
  await recordRoomAuditAndEvent(tx,{
    actorPersonId:host.actor.actorPersonId!,organizationId:host.organizationId,
    eventCode:"learning.facilitated.room.started",eventType:"FacilitatedLearningRoomStarted",
    sessionId:created.id,
    payload:{deploymentId:data.deploymentId,courseVersionId:data.courseVersionId,siteId:access.siteId},
  });
  return {facilitatedSessionId:created.id,pairingCode:displayCode(code),
    pairingExpiresAt:pairingExpiresAt.toISOString()};
}

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

/**
 * A self-enrolled facilitated adult is registered at one exact hosting Site.
 * Legacy noncredit registrations with no explicit Site claim are unaffected;
 * independently registered online learners may attend an approved Site room
 * without creating a second registration or resetting learning progress.
 */
export export async function selfEnrolledNoncreditRoomSitePermitted(
  tx:Tx, access:{source:"school"|"noncredit";noncreditRegistrationId:string|null},
  roomSiteId:string,
):Promise<boolean> {
  if(access.source!=="noncredit"||!access.noncreditRegistrationId)return true;
  try {
    const [claim]=await tx.select({siteId:noncreditSelfEnrollmentClaims.siteId})
      .from(noncreditSelfEnrollmentClaims)
      .where(eq(noncreditSelfEnrollmentClaims.registrationId,access.noncreditRegistrationId))
      .limit(1);
    return !claim || claim.siteId===null || claim.siteId===roomSiteId;
  } catch(error) {
    // Existing classroom services can be deployed before the additive
    // enrollment migration reaches production. No self-enrollment claim
    // can exist there yet, so preserve legacy canonical pairing behavior.
    let cause:unknown=error;
    for(let depth=0;depth<4 && cause && typeof cause==="object";depth++){
      const item=cause as {code?:string;message?:string;cause?:unknown};
      if(item.code==="42P01" && item.message?.includes("noncredit_self_enrollment_claims"))
        return true;
      cause=item.cause;
    }
    throw error;
  }
}

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

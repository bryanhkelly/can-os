/** Privileged Classroom operations. This module must never be imported by a
 * browser component. Server functions are exposed only through the
 * TanStack createServerFn endpoints in facilitated-learning.functions.ts. */
import { randomInt, createHmac } from "node:crypto";
import { and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, catalogSites, canonicalAccounts, canonicalAccountGrants, contentAssetVersions, courseLessons, courseVersions, enrollments, learnerProfiles, canonicalClassEnrollments, noncreditRegistrations, noncreditTrainingVersions, deploymentOfferingAdoptions, offeringVersions, classroomOfferingCourses, domainEvents, educationOperationOrganizationRoles, educationOperationSites, facilitatedLearningParticipants, facilitatedLearningSessions, learnerCourseAttempts, programDeployments, classroomDeploymentSites, classroomEnrollmentSitePlacements, siteOrganizationRoles, trackLessonPresentations, noncreditSelfEnrollmentClaims } from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { facilitatedCodeAlphabet, facilitatedCodeLength, facilitatedPairingWindowMs, facilitatedRoomOperationalState, roomMediaAudienceEligible } from "@/domain/facilitated-learning";
import { attemptInAssignedClassroomRelease } from "./classroom-release-boundary.server";
import { assertNativeClassRoomStaff, nativeClassRoomParticipant } from "@/modules/classes/native-class-room-boundary.server";
import { requireCanonicalFacilitator } from "./canonical-facilitator-access.server";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Host = Awaited<ReturnType<typeof requireCanonicalFacilitator>>;
function pairingPepper() {
  const pepper = process.env.CAN_FACILITATED_PAIRING_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("Facilitated pairing is not configured.");
  return pepper;
}
export function digestCode(code: string) {
  return createHmac("sha256", pairingPepper()).update(code).digest("hex");
}
export function generatePairingCode() {
  let code = "";
  for (let i = 0; i < facilitatedCodeLength; i++) {
    code += facilitatedCodeAlphabet[randomInt(facilitatedCodeAlphabet.length)];
  }
  return code;
}
export function displayCode(code: string) { return code.slice(0, 5) + "-" + code.slice(5); }

/**
 * Canonical audit + domain-event pair for facilitated room lifecycle actions,
 * following the noncredit completion convention. Audit rows carry the host
 * organization; domain events stay reprocessable through the outbox.
 */
export async function recordRoomAuditAndEvent(
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
  if(!grant)return false;
  try {
    await assertNativeClassRoomStaff(tx,room);
  }catch(error){
    if(error instanceof AuthorizationError)return false;
    throw error;
  }
  return true;
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
  await assertNativeClassRoomStaff(tx,room);
  return room;
}
export function assertRoomLive(room: typeof facilitatedLearningSessions.$inferSelect, now:Date) {
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
export async function currentRoomMediaAudience(
  tx: Tx,
  room: typeof facilitatedLearningSessions.$inferSelect,
): Promise<Array<typeof learnerCourseAttempts.$inferSelect>> {
  const nativeClass=await assertNativeClassRoomStaff(tx,room);
  if(nativeClass){
    // Approved native Class lessons can start before a learner scans the QR.
    // Recording rights come from enrolled people in this exact Class,
    // never a different Class sharing the same Course, Site or Deployment.
    const candidates=await tx.select({
      attempt:learnerCourseAttempts,
      personId:canonicalClassEnrollments.learnerPersonId,
    }).from(canonicalClassEnrollments)
      .innerJoin(learnerCourseAttempts,and(
        eq(learnerCourseAttempts.id,canonicalClassEnrollments.courseAttemptId),
        eq(learnerCourseAttempts.classEnrollmentId,canonicalClassEnrollments.id),
        eq(learnerCourseAttempts.courseVersionId,nativeClass.courseVersionId),
        eq(learnerCourseAttempts.deploymentId,nativeClass.deploymentId),
        eq(learnerCourseAttempts.adoptionId,nativeClass.adoptionId),
        eq(learnerCourseAttempts.offeringVersionId,nativeClass.offeringVersionId),
        eq(learnerCourseAttempts.status,"active"),
        isNull(learnerCourseAttempts.enrollmentId),
        isNull(learnerCourseAttempts.noncreditRegistrationId),
      )).where(and(
        eq(canonicalClassEnrollments.classId,nativeClass.classId),
        eq(canonicalClassEnrollments.status,"active"),
      )).limit(501);
    if(candidates.length>500)
      throw new AuthorizationError("bounded native Class audience for recording rights");
    const adoptions=new Map<string,typeof learnerCourseAttempts.$inferSelect>();
    for(const candidate of candidates){
      // The SQL join verifies exact active Class/Attempt identity for every
      // candidate. Run the more expensive authority guard once per distinct
      // adoption, rather than once for each learner on every 2.5s poll.
      if(!adoptions.has(candidate.attempt.adoptionId)){
        await nativeClassRoomParticipant(tx,room,candidate.attempt.id,candidate.personId);
        adoptions.set(candidate.attempt.adoptionId,candidate.attempt);
      }
    }
    return [...adoptions.values()];
  }
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
    if (!attempt.classEnrollmentId &&
        Boolean(attempt.enrollmentId) === Boolean(attempt.noncreditRegistrationId))
      throw new AuthorizationError("single current Course participation source");
    if (attempt.classEnrollmentId) {
      const native=await nativeClassRoomParticipant(
        tx,room,attempt.id,participantPersonId);
      sourceCurrent=!!native;
      currentRoomSitePlacement=!!native;
    } else if (attempt.enrollmentId) {
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

export async function assertRoomMediaRightsForAudience(
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


/**
 * A self-enrolled facilitated adult is registered at one exact hosting Site.
 * Legacy noncredit registrations with no explicit Site claim are unaffected;
 * independently registered online learners may attend an approved Site room
 * without creating a second registration or resetting learning progress.
 */
export async function selfEnrolledNoncreditRoomSitePermitted(
  tx:Tx, access:{source:"school"|"noncredit"|"class";noncreditRegistrationId:string|null},
  roomSiteId:string,
):Promise<boolean> {
  // Exact native Class→Session scope is checked elsewhere; never reuse a
  // provider-wide noncredit Site claim as Class room authorization.
  if(access.source==="class")return false;
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


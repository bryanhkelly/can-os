/** Exact-Site and exact-release learner check, never client-importable. */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { enrollments, noncreditSelfEnrollmentClaims, learnerCourseAttempts, learnerProfiles, noncreditRegistrations } from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { assignedClassroomRelease, attemptInAssignedClassroomRelease } from "./classroom-release-boundary.server";
import { ownedRoom, schoolAttemptIsPlacedAtSite, selfEnrolledNoncreditRoomSitePermitted } from "./facilitated-learning-operations.server";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Room = Awaited<ReturnType<typeof ownedRoom>>;
/** A room with an assigned noncredit release is NOT a generic Course/Site
 * classroom: other releases at the same Site remain separate cohorts. */
export async function registeredRoomParticipant(
  tx:Tx,room:Room,courseAttemptId:string, releaseScope?:string|null,
){
  const releaseId=releaseScope===undefined
    ? await assignedClassroomRelease(tx,room):releaseScope;
  const [attempt]=await tx.select().from(learnerCourseAttempts).where(and(
    eq(learnerCourseAttempts.id,courseAttemptId),
    eq(learnerCourseAttempts.deploymentId,room.deploymentId),
    eq(learnerCourseAttempts.courseVersionId,room.courseVersionId),
    eq(learnerCourseAttempts.status,"active"),
  )).limit(1);
  if(!attempt||Boolean(attempt.enrollmentId)===Boolean(attempt.noncreditRegistrationId))
    throw new AuthorizationError("current registered classroom Course attempt");
  if(attempt.enrollmentId){
    if(releaseId)throw new AuthorizationError("noncredit enrollment release participant");
    const [school]=await tx.select({
      personId:learnerProfiles.personId,
    }).from(enrollments).innerJoin(learnerProfiles,
      eq(learnerProfiles.id,enrollments.learnerId))
      .where(and(
        eq(enrollments.id,attempt.enrollmentId),
        eq(enrollments.deploymentId,room.deploymentId),
        eq(enrollments.status,"active"),
      )).limit(1);
    if(!school || !await schoolAttemptIsPlacedAtSite(
      tx,attempt.id,room.deploymentId,room.siteId,new Date(),
    ))throw new AuthorizationError("current school enrollment at this Site");
    return {personId:school.personId,source:"school" as const};
  }
  const [registration]=await tx.select({
    personId:noncreditRegistrations.participantPersonId,
    registrationId:noncreditRegistrations.id,
  }).from(noncreditRegistrations).where(and(
    eq(noncreditRegistrations.id,attempt.noncreditRegistrationId!),
    eq(noncreditRegistrations.deploymentId,room.deploymentId),
    eq(noncreditRegistrations.adoptionId,attempt.adoptionId),
    eq(noncreditRegistrations.offeringVersionId,attempt.offeringVersionId),
    inArray(noncreditRegistrations.status,["registered","active"]),
  )).limit(1);
  if(!registration||!await selfEnrolledNoncreditRoomSitePermitted(tx,{
    source:"noncredit",noncreditRegistrationId:registration.registrationId,
  },room.siteId))throw new AuthorizationError("active noncredit registration for Site");
  if(releaseId){
    const [claim]=await tx.select({id:noncreditSelfEnrollmentClaims.id})
      .from(noncreditSelfEnrollmentClaims).where(and(
        eq(noncreditSelfEnrollmentClaims.releaseId,releaseId),
        eq(noncreditSelfEnrollmentClaims.registrationId,registration.registrationId),
        eq(noncreditSelfEnrollmentClaims.participantPersonId,registration.personId),
        eq(noncreditSelfEnrollmentClaims.siteId,room.siteId),
      )).limit(1);
    if(!claim)throw new AuthorizationError("participant of this specific enrollment release");
    if(!await attemptInAssignedClassroomRelease(
      tx,room,attempt.id,registration.personId,releaseId,
    ))throw new AuthorizationError("verified participant of this exact classroom release");
  }
  return {personId:registration.personId,source:"noncredit" as const};
}

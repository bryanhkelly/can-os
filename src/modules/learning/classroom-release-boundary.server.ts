import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  facilitatedClassroomPlans,facilitatedLearningSessions,learnerCourseAttempts,
  noncreditRegistrations,noncreditSelfEnrollmentClaims,
  noncreditSelfEnrollmentReleases,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { nativeClassRoomParticipant } from "@/modules/classes/native-class-room-boundary.server";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Room=typeof facilitatedLearningSessions.$inferSelect;

/** No release means the original Site/Course-based session behavior. Once a
 * plan explicitly references a release, NEVER fall back to Site/Course access.
 */
export async function assignedClassroomRelease(tx:Tx,room:Room):Promise<string|null>{
  const [plan]=await tx.select({
    releaseId:facilitatedClassroomPlans.enrollmentReleaseId,
    state:facilitatedClassroomPlans.state,
    deploymentId:facilitatedClassroomPlans.deploymentId,
    courseVersionId:facilitatedClassroomPlans.courseVersionId,
    siteId:facilitatedClassroomPlans.siteId,
    hostOrganizationId:facilitatedClassroomPlans.hostOrganizationId,
  }).from(facilitatedClassroomPlans)
    .where(eq(facilitatedClassroomPlans.facilitatedSessionId,room.id)).limit(1);
  if(!plan)return null;
  if(plan.state!=="started"||plan.deploymentId!==room.deploymentId||
    plan.courseVersionId!==room.courseVersionId||plan.siteId!==room.siteId||
    plan.hostOrganizationId!==room.hostOrganizationId)
    throw new AuthorizationError("room schedule is not currently valid");
  if(!plan.releaseId)return null;
  const [release]=await tx.select({id:noncreditSelfEnrollmentReleases.id})
    .from(noncreditSelfEnrollmentReleases).where(and(
      eq(noncreditSelfEnrollmentReleases.id,plan.releaseId),
      eq(noncreditSelfEnrollmentReleases.deploymentId,room.deploymentId),
      eq(noncreditSelfEnrollmentReleases.courseVersionId,room.courseVersionId),
      eq(noncreditSelfEnrollmentReleases.siteId,room.siteId),
      eq(noncreditSelfEnrollmentReleases.registeringOrganizationId,room.hostOrganizationId),
      eq(noncreditSelfEnrollmentReleases.deliveryMode,"facilitated"),
    )).limit(1);
  if(!release)throw new AuthorizationError("room enrollment release is invalid");
  return release.id;
}

/** Shared across joining, live companion reads, media, formative activity and
 * independent attendance. Never infer cohort membership by Course and Site.
 * The claim's Person, registration, Site and exact release must all match.
 */
export async function attemptInAssignedClassroomRelease(
  tx:Tx,room:Room,courseAttemptId:string,participantPersonId:string,
  resolvedRelease?:string|null,
):Promise<boolean>{
  // Native Class rooms can never use the old Course/Site or noncredit
  // enrollment-release fallback. Check Class Enrollment and current adoption.
  try {
    if(await nativeClassRoomParticipant(tx,room,courseAttemptId,participantPersonId))
      return true;
  }catch(e){
    if(e instanceof AuthorizationError)return false;
    throw e;
  }
  const releaseId=resolvedRelease===undefined
    ?await assignedClassroomRelease(tx,room):resolvedRelease;
  if(!releaseId)return true;
  const [claim]=await tx.select({id:noncreditSelfEnrollmentClaims.id})
    .from(noncreditSelfEnrollmentClaims)
    .innerJoin(learnerCourseAttempts,and(
      eq(learnerCourseAttempts.noncreditRegistrationId,
        noncreditSelfEnrollmentClaims.registrationId),
      eq(learnerCourseAttempts.id,courseAttemptId),
      eq(learnerCourseAttempts.deploymentId,room.deploymentId),
      eq(learnerCourseAttempts.courseVersionId,room.courseVersionId),
    ))
    .innerJoin(noncreditRegistrations,and(
      eq(noncreditRegistrations.id,noncreditSelfEnrollmentClaims.registrationId),
      eq(noncreditRegistrations.participantPersonId,
        noncreditSelfEnrollmentClaims.participantPersonId),
    ))
    .where(and(
      eq(noncreditSelfEnrollmentClaims.releaseId,releaseId),
      eq(noncreditSelfEnrollmentClaims.siteId,room.siteId),
      eq(noncreditSelfEnrollmentClaims.participantPersonId,participantPersonId),
    )).limit(1);
  return !!claim;
}

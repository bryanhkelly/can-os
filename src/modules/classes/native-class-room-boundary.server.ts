import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  canonicalClasses, canonicalClassSessions, canonicalClassEnrollments,
  canonicalClassStaffAssignments, facilitatedClassroomPlans,
  learnerCourseAttempts,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { currentClassAuthority } from "./native-class-enrollment.functions";
import type { facilitatedLearningSessions } from "@/db/canonical-v301";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Room=typeof facilitatedLearningSessions.$inferSelect;

/** Returns null only for a genuinely non-Class room. Once a room has a Class
 * link, any mismatched plan, Course, facilitator, Site or revoked adoption
 * denies instead of falling back to old Course/Site enrollment logic.
 */
export async function nativeClassForRoom(tx:Tx,room:Room){
  const [row]=await tx.select({
    classId:canonicalClassSessions.classId,
    planId:facilitatedClassroomPlans.id,
    planState:facilitatedClassroomPlans.state,
    planReleaseId:facilitatedClassroomPlans.enrollmentReleaseId,
    planRoomId:facilitatedClassroomPlans.facilitatedSessionId,
    planDeliveryId:facilitatedClassroomPlans.deliverySessionId,
    linkedDeliveryId:canonicalClassSessions.deliverySessionId,
    planCourseId:facilitatedClassroomPlans.courseVersionId,
    planDeploymentId:facilitatedClassroomPlans.deploymentId,
    planSiteId:facilitatedClassroomPlans.siteId,
    planOrganizationId:facilitatedClassroomPlans.hostOrganizationId,
    planFacilitatorId:facilitatedClassroomPlans.facilitatorPersonId,
    classInstance:canonicalClasses,
  }).from(canonicalClassSessions)
    .innerJoin(facilitatedClassroomPlans,
      eq(facilitatedClassroomPlans.id,canonicalClassSessions.classroomPlanId))
    .innerJoin(canonicalClasses,eq(canonicalClasses.id,canonicalClassSessions.classId))
    .where(eq(facilitatedClassroomPlans.facilitatedSessionId,room.id)).limit(1);
  if(!row)return null;
  const cls=row.classInstance;
  if(row.planState!=="started"||row.planReleaseId!==null||
     row.planRoomId!==room.id||row.planDeliveryId!==row.linkedDeliveryId ||
     row.planCourseId!==room.courseVersionId ||
     row.planDeploymentId!==room.deploymentId ||
     row.planSiteId!==room.siteId ||
     row.planOrganizationId!==room.hostOrganizationId ||
     row.planFacilitatorId!==room.facilitatorPersonId ||
     cls.id!==row.classId||cls.state!=="active" ||
     cls.deploymentId!==room.deploymentId ||
     cls.courseVersionId!==room.courseVersionId ||
     cls.siteId!==room.siteId ||
     cls.operatingOrganizationId!==room.hostOrganizationId){
    throw new AuthorizationError("exact live Class Session and facilitated room");
  }
  await currentClassAuthority(tx,cls.id,new Date());
  return {classId:cls.id,adoptionId:cls.adoptionId,
    offeringVersionId:cls.offeringVersionId,courseVersionId:cls.courseVersionId,
    deploymentId:cls.deploymentId,siteId:cls.siteId,
    facilitatorPersonId:room.facilitatorPersonId,
  };
}

/** Session ownership is not sufficient once a Class staff assignment expires
 * or is revoked. All room controls and audience access fail immediately.
 */
export async function assertNativeClassRoomStaff(tx:Tx,room:Room){
  const linked=await nativeClassForRoom(tx,room);
  if(!linked)return null;
  const now=new Date();
  const [staff]=await tx.select({id:canonicalClassStaffAssignments.id})
    .from(canonicalClassStaffAssignments).where(and(
      eq(canonicalClassStaffAssignments.classId,linked.classId),
      eq(canonicalClassStaffAssignments.personId,room.facilitatorPersonId),
      eq(canonicalClassStaffAssignments.state,"approved"),
      lte(canonicalClassStaffAssignments.beginsAt,now),
      or(isNull(canonicalClassStaffAssignments.endsAt),
        gt(canonicalClassStaffAssignments.endsAt,now)),
    )).limit(1);
  if(!staff)throw new AuthorizationError("current instructor assignment to the exact Class");
  return linked;
}

/** Native participant identity is Class Enrollment, NEVER deployment/Course
 * alone. A non-native Course Attempt cannot join a native Class room.
 */
export async function nativeClassRoomParticipant(
  tx:Tx,room:Room,courseAttemptId:string,participantPersonId:string,
):Promise<{classId:string;personId:string}|null>{
  const linked=await nativeClassForRoom(tx,room);
  const [attempt]=await tx.select({
    classEnrollmentId:learnerCourseAttempts.classEnrollmentId,
    id:learnerCourseAttempts.id,
  }).from(learnerCourseAttempts)
    .where(eq(learnerCourseAttempts.id,courseAttemptId)).limit(1);
  if(!linked){
    if(attempt?.classEnrollmentId)throw new AuthorizationError("Class Course Attempt cannot join an unbound room");
    return null;
  }
  if(!attempt?.classEnrollmentId)throw new AuthorizationError("native Class Course Attempt required");
  const [member]=await tx.select({id:canonicalClassEnrollments.id})
    .from(canonicalClassEnrollments)
    .innerJoin(learnerCourseAttempts,and(
      eq(learnerCourseAttempts.id,courseAttemptId),
      eq(learnerCourseAttempts.classEnrollmentId,canonicalClassEnrollments.id),
      eq(learnerCourseAttempts.courseVersionId,linked.courseVersionId),
      eq(learnerCourseAttempts.deploymentId,linked.deploymentId),
      eq(learnerCourseAttempts.adoptionId,linked.adoptionId),
      eq(learnerCourseAttempts.offeringVersionId,linked.offeringVersionId),
      eq(learnerCourseAttempts.status,"active"),
      isNull(learnerCourseAttempts.enrollmentId),
      isNull(learnerCourseAttempts.noncreditRegistrationId),
    ))
    .where(and(
      eq(canonicalClassEnrollments.id,attempt.classEnrollmentId),
      eq(canonicalClassEnrollments.classId,linked.classId),
      eq(canonicalClassEnrollments.learnerPersonId,participantPersonId),
      eq(canonicalClassEnrollments.courseAttemptId,courseAttemptId),
      eq(canonicalClassEnrollments.status,"active"),
    )).limit(1);
  if(!member)throw new AuthorizationError("current learner enrollment in this exact Class");
  return {classId:linked.classId,personId:participantPersonId};
}

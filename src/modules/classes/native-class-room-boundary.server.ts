import { and, desc, eq, gt, isNotNull, isNull, lte, or } from "drizzle-orm";
import { accessAccounts, accountPersonGrants, people } from "@/db/schema";
import { db } from "@/db/client";
import {
  canonicalClasses, canonicalClassSessions, canonicalClassEnrollments,
  canonicalClassStaffAssignments, facilitatedClassroomPlans,
  learnerCourseAttempts, domainEvents,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { currentClassAuthority } from "./native-class-authority.server";
import type { facilitatedLearningSessions } from "@/db/canonical-v301";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Room=typeof facilitatedLearningSessions.$inferSelect;

/** Class assignment must be backed by a *currently active*, separately
 * verified Site facilitator grant. A manager's Site role does not silently
 * become a teaching grant and revoking the facilitator grant takes effect
 * on the next player, pairing or scheduling request. */
export async function assertCurrentNativeTeachingGrant(
  tx:Tx,personId:string,organizationId:string,siteId:string,
):Promise<void>{
  const [grant]=await tx.select({id:accountPersonGrants.id})
    .from(accountPersonGrants)
    .innerJoin(accessAccounts,and(
      eq(accessAccounts.id,accountPersonGrants.accountId),
      eq(accessAccounts.personId,accountPersonGrants.personId),
      eq(accessAccounts.disabled,false),
      isNotNull(accessAccounts.emailVerifiedAt),
    ))
    .innerJoin(people,and(
      eq(people.id,accountPersonGrants.personId),
      eq(people.active,true),
    ))
    .where(and(
      eq(accountPersonGrants.personId,personId),
      eq(accountPersonGrants.organizationId,organizationId),
      eq(accountPersonGrants.siteId,siteId),
      eq(accountPersonGrants.role,"room_facilitator"),
      eq(accountPersonGrants.active,true),
    )).limit(1);
  if(!grant)throw new AuthorizationError("current verified Class facilitator grant");
}

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
    originalFacilitatorId:canonicalClassSessions.facilitatorPersonId,
    classSessionId:canonicalClassSessions.id,
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
     row.planFacilitatorId!==row.originalFacilitatorId ||
     cls.id!==row.classId||cls.state!=="active" ||
     cls.deploymentId!==room.deploymentId ||
     cls.courseVersionId!==room.courseVersionId ||
     cls.siteId!==room.siteId ||
     cls.operatingOrganizationId!==room.hostOrganizationId){
    throw new AuthorizationError("exact live Class Session and facilitated room");
  }
  await currentClassAuthority(tx,cls.id,new Date());
  // Preserve the immutable scheduled facilitator. A different current room
  // controller must have the matching durable manager-directed transfer.
  if(row.originalFacilitatorId!==room.facilitatorPersonId){
    const [transfer]=await tx.select({payload:domainEvents.payload}).from(domainEvents)
      .where(and(eq(domainEvents.aggregateType,"facilitated_learning_session"),
        eq(domainEvents.aggregateId,room.id),eq(domainEvents.eventType,"ClassroomControlTransferred")))
      .orderBy(desc(domainEvents.occurredAt),desc(domainEvents.id)).limit(1);
    if(!transfer||transfer.payload.classSessionId!==row.classSessionId||
       transfer.payload.toPersonId!==room.facilitatorPersonId||
       transfer.payload.originalFacilitatorPersonId!==row.originalFacilitatorId)
      throw new AuthorizationError("governed current classroom control assignment");
  }
  return {classId:cls.id,classSessionId:row.classSessionId,originalFacilitatorPersonId:row.originalFacilitatorId,adoptionId:cls.adoptionId,
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
  await assertAssignedNativeClassFacilitator(tx,linked.classId,room.facilitatorPersonId,room.hostOrganizationId,room.siteId,new Date());
  return linked;
}

export async function assertAssignedNativeClassFacilitator(tx:Tx,classId:string,personId:string,organizationId:string,siteId:string,now:Date){
  const [staff]=await tx.select({id:canonicalClassStaffAssignments.id})
    .from(canonicalClassStaffAssignments).where(and(
      eq(canonicalClassStaffAssignments.classId,classId),
      eq(canonicalClassStaffAssignments.personId,personId),
      eq(canonicalClassStaffAssignments.roleCode,"facilitator"),
      eq(canonicalClassStaffAssignments.state,"approved"),
      lte(canonicalClassStaffAssignments.beginsAt,now),
      or(isNull(canonicalClassStaffAssignments.endsAt),
        gt(canonicalClassStaffAssignments.endsAt,now)),
    )).limit(1);
  if(!staff)throw new AuthorizationError("current facilitator assignment to the exact Class");
  await assertCurrentNativeTeachingGrant(tx,personId,organizationId,siteId);
}

/** Personal learner/attendance data is visible only when a verified Class
 * manager explicitly granted the room facilitator attendance permission
 * on the immutable, audited Person-to-Class teaching assignment.
 */
export async function assertNativeClassAttendanceReader(
  tx:Tx,room:Room,actorPersonId:string,
):Promise<void>{
  const linked=await assertNativeClassRoomStaff(tx,room);
  if(!linked||actorPersonId!==room.facilitatorPersonId)
    throw new AuthorizationError("exact native Class room facilitator");
  const now=new Date();
  const [delegated]=await tx.select({id:canonicalClassStaffAssignments.id})
    .from(canonicalClassStaffAssignments).where(and(
      eq(canonicalClassStaffAssignments.classId,linked.classId),
      eq(canonicalClassStaffAssignments.personId,actorPersonId),
      eq(canonicalClassStaffAssignments.roleCode,"facilitator"),
      eq(canonicalClassStaffAssignments.state,"approved"),
      eq(canonicalClassStaffAssignments.attendanceAuthorized,true),
      lte(canonicalClassStaffAssignments.beginsAt,now),
      or(isNull(canonicalClassStaffAssignments.endsAt),
        gt(canonicalClassStaffAssignments.endsAt,now)),
    )).limit(1);
  if(!delegated)
    throw new AuthorizationError("Class manager-approved attendance verification permission");
}

/** Native participant identity is Class Enrollment, NEVER deployment/Course
 * alone. A Course Registration may share one Attempt after exact Class placement.
 */
export async function nativeClassRoomParticipant(
  tx:Tx,room:Room,courseAttemptId:string,participantPersonId:string,
):Promise<{classId:string;personId:string}|null>{
  const linked=await assertNativeClassRoomStaff(tx,room);
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

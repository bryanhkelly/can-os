import { createServerFn } from "@tanstack/react-start";
import { registeredRoomParticipant } from "./classroom-attendance-operations.server";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents, classroomPersons, domainEvents, enrollments,
  noncreditSelfEnrollmentClaims,
  facilitatedLearningParticipants, facilitatedRoomAttendanceAssertions,
  learnerCourseAttempts, learnerProfiles, noncreditRegistrations,
  canonicalClassEnrollments,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { nativeClassForRoom, assertNativeClassAttendanceReader } from "@/modules/classes/native-class-room-boundary.server";
import { classroomAttestationOpen, classroomAttendanceNeedsExplanation } from "@/domain/classroom-attendance";
import {assignedClassroomRelease,attemptInAssignedClassroomRelease} from "./classroom-release-boundary.server";
import { requireCanonicalFacilitator } from "./canonical-facilitator-access.server";
import {
  ownedRoom, schoolAttemptIsPlacedAtSite,
  selfEnrolledNoncreditRoomSitePermitted,
} from "./facilitated-learning-operations.server";
import { requireFacilitatedLearningEnabled } from "./canonical-learning-release.server";

const id=z.string().uuid();
const roomInput=z.object({facilitatedSessionId:id}).strict();
const attendanceInput=roomInput.extend({
  courseAttemptId:id,requestId:id,
  status:z.enum(["present","absent","unknown"]),
  method:z.enum(["in_person_roll_call","remote_live_check"]),
  evidenceNote:z.string().trim().max(250).nullable(),
}).strict();
function guard(){
  requireFacilitatedLearningEnabled();
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}
export const getClassroomAttendanceRoster=createServerFn({method:"GET"})
  .validator((v:unknown)=>roomInput.parse(v))
  .handler(async({data})=>{
    guard();const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId);
      const releaseScope=await assignedClassroomRelease(tx,room);
      const native=await nativeClassForRoom(tx,room);
      // Native teacher assignment alone is not consent to expose a learner
      // roster. A verified site manager may review attendance records.
      if(native)
        await assertNativeClassAttendanceReader(tx,room,host.actor.actorPersonId!);
      // Scope the SQL BEFORE LIMIT: other cohorts must not crowd out this roster.
      const attempts=native
        ? await tx.select({id:learnerCourseAttempts.id})
            .from(learnerCourseAttempts)
            .innerJoin(canonicalClassEnrollments,and(
              eq(canonicalClassEnrollments.id,learnerCourseAttempts.classEnrollmentId),
              eq(canonicalClassEnrollments.classId,native.classId),
              eq(canonicalClassEnrollments.status,"active"),
              eq(canonicalClassEnrollments.courseAttemptId,learnerCourseAttempts.id),
            ))
            .where(and(
              eq(learnerCourseAttempts.deploymentId,room.deploymentId),
              eq(learnerCourseAttempts.courseVersionId,room.courseVersionId),
              eq(learnerCourseAttempts.status,"active"),
            )).limit(301)
        : releaseScope
        ? await tx.select({id:learnerCourseAttempts.id})
            .from(learnerCourseAttempts)
            .innerJoin(noncreditRegistrations,eq(
              noncreditRegistrations.id,learnerCourseAttempts.noncreditRegistrationId,
            ))
            .innerJoin(noncreditSelfEnrollmentClaims,and(
              eq(noncreditSelfEnrollmentClaims.registrationId,noncreditRegistrations.id),
              eq(noncreditSelfEnrollmentClaims.releaseId,releaseScope),
              eq(noncreditSelfEnrollmentClaims.participantPersonId,
                noncreditRegistrations.participantPersonId),
              eq(noncreditSelfEnrollmentClaims.siteId,room.siteId),
            ))
            .where(and(
              eq(learnerCourseAttempts.deploymentId,room.deploymentId),
              eq(learnerCourseAttempts.courseVersionId,room.courseVersionId),
              eq(learnerCourseAttempts.status,"active"),
              inArray(noncreditRegistrations.status,["registered","active"]),
            )).limit(301)
        : await tx.select({id:learnerCourseAttempts.id})
            .from(learnerCourseAttempts).where(and(
              eq(learnerCourseAttempts.deploymentId,room.deploymentId),
              eq(learnerCourseAttempts.courseVersionId,room.courseVersionId),
              eq(learnerCourseAttempts.status,"active"),
            )).limit(301);
      const eligible:{id:string;personId:string;source:"school"|"noncredit"|"class"}[]=[];
      for(const attempt of attempts.slice(0,300)){
        try {
          const person=await registeredRoomParticipant(tx,room,attempt.id,releaseScope);
          eligible.push({id:attempt.id,...person});
        }catch(error) {
          if(!(error instanceof AuthorizationError))throw error;
        }
      }
      const ids=eligible.map(x=>x.id);
      // One Neon transaction connection cannot execute concurrent queries.
      const pairs=ids.length?await tx.select({
        attemptId:facilitatedLearningParticipants.courseAttemptId,
      }).from(facilitatedLearningParticipants).where(and(
        eq(facilitatedLearningParticipants.facilitatedSessionId,room.id),
        inArray(facilitatedLearningParticipants.courseAttemptId,ids),
        isNull(facilitatedLearningParticipants.leftAt),
      )):[];
      const attestations=await tx.select()
        .from(facilitatedRoomAttendanceAssertions)
        .where(eq(facilitatedRoomAttendanceAssertions.facilitatedSessionId,room.id))
        .orderBy(desc(facilitatedRoomAttendanceAssertions.assertedAt),
          desc(facilitatedRoomAttendanceAssertions.id)).limit(1001);
      const persons=eligible.length?await tx.select({
        id:classroomPersons.id,first:classroomPersons.legalFirstName,
        last:classroomPersons.legalLastName,preferred:classroomPersons.preferredName,
      }).from(classroomPersons).where(inArray(
        classroomPersons.id,eligible.map(x=>x.personId),
      )):[];
      const paired=new Set(pairs.map(x=>x.attemptId));
      const name=new Map(persons.map(x=>[x.id,
        [x.preferred||x.first,x.last].filter(Boolean).join(" ").trim(),
      ]));
      const latest=new Map<string,typeof attestations[number]>();
      for(const a of attestations)if(!latest.has(a.courseAttemptId))
        latest.set(a.courseAttemptId,a);
      return {
        facilitatedSessionId:room.id,
        attestationsOpen:classroomAttestationOpen(room,new Date()),
        members:eligible.map(x=>({
          courseAttemptId:x.id,displayName:name.get(x.personId)??"Registered learner",
          source:x.source,pairedDevice:paired.has(x.id),
          latestStatus:latest.get(x.id)?.status??"unknown",
          latestMethod:latest.get(x.id)?.method??null,
          lastAssertedAt:latest.get(x.id)?.assertedAt.toISOString()??null,
        })),
        partial:attempts.length>300 || attestations.length>1000,
        notice:"Registered learners, paired devices and facilitator attestation are separate evidence levels. This does not create official school attendance.",
      };
    });
  });

/**
 * A no-device participant has no phantom facilitated_learning_participant row.
 * Their existing active Course attempt and exact Site authorization are still
 * mandatory. The host attests direct observation with an explicit explanation.
 * Corrections are append-only and preserve all previous assertions.
 */
export const attestClassroomParticipation=createServerFn({method:"POST"})
  .validator((v:unknown)=>attendanceInput.parse(v))
  .handler(async({data})=>{
    guard();const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId,true);
      if(await nativeClassForRoom(tx,room))
        await assertNativeClassAttendanceReader(tx,room,host.actor.actorPersonId!);
      if(!classroomAttestationOpen(room,new Date()))
        throw new AuthorizationError("attestation window is closed");
      const subject=await registeredRoomParticipant(tx,room,data.courseAttemptId);
      const [paired]=await tx.select({
        personId:facilitatedLearningParticipants.participantPersonId,
      }).from(facilitatedLearningParticipants).where(and(
        eq(facilitatedLearningParticipants.facilitatedSessionId,room.id),
        eq(facilitatedLearningParticipants.courseAttemptId,data.courseAttemptId),
        isNull(facilitatedLearningParticipants.leftAt),
      )).limit(1);
      if(paired && paired.personId!==subject.personId)
        throw new AuthorizationError("mismatched paired classroom identity");
      const [sameRequest]=await tx.select().from(facilitatedRoomAttendanceAssertions)
        .where(and(
          eq(facilitatedRoomAttendanceAssertions.facilitatedSessionId,room.id),
          eq(facilitatedRoomAttendanceAssertions.requestId,data.requestId),
        )).limit(1);
      if(sameRequest){
        if(sameRequest.courseAttemptId!==data.courseAttemptId ||
          sameRequest.facilitatorPersonId!==host.actor.actorPersonId ||
          sameRequest.status!==data.status || sameRequest.method!==data.method ||
          sameRequest.evidenceNote!==data.evidenceNote)
          throw new Error("Conflicting attendance evidence retry");
        return {saved:true,duplicate:true,noDeviceEvidence:!paired};
      }
      const [previous]=await tx.select({
        status:facilitatedRoomAttendanceAssertions.status,
        method:facilitatedRoomAttendanceAssertions.method,
      }).from(facilitatedRoomAttendanceAssertions).where(and(
        eq(facilitatedRoomAttendanceAssertions.facilitatedSessionId,room.id),
        eq(facilitatedRoomAttendanceAssertions.courseAttemptId,data.courseAttemptId),
      )).orderBy(desc(facilitatedRoomAttendanceAssertions.assertedAt),
        desc(facilitatedRoomAttendanceAssertions.id)).limit(1);
      const correction=!!previous &&
        (previous.status!==data.status || previous.method!==data.method);
      if(classroomAttendanceNeedsExplanation({
        pairedDevice:!!paired,previousStatus:previous?.status,
        previousMethod:previous?.method,nextStatus:data.status,nextMethod:data.method,
      }) && (!data.evidenceNote || data.evidenceNote.length<15))
        throw new AuthorizationError(
          "document direct verification for no-device participation and corrections",
        );
      const [saved]=await tx.insert(facilitatedRoomAttendanceAssertions).values({
        facilitatedSessionId:room.id,courseAttemptId:data.courseAttemptId,
        facilitatorPersonId:host.actor.actorPersonId!,requestId:data.requestId,
        status:data.status,method:data.method,evidenceNote:data.evidenceNote,
      }).returning({id:facilitatedRoomAttendanceAssertions.id});
      if(!saved)throw new Error("Could not record attendance verification");
      const payload={
        facilitatedSessionId:room.id,courseAttemptId:data.courseAttemptId,
        status:data.status,method:data.method,noDevice:!paired,
        correction,
      };
      await tx.insert(auditEvents).values({
        actorPersonId:host.actor.actorPersonId!,
        owningOrganizationId:host.organizationId,
        eventCode:correction?"learning.classroom.attendance.corrected":
          "learning.classroom.attendance.attested",
        entityKind:"facilitated_room_attendance_assertion",entityId:saved.id,
        payload,
      });
      await tx.insert(domainEvents).values({
        eventType:correction?"ClassroomAttendanceCorrected":"ClassroomAttendanceAttested",
        aggregateType:"facilitated_room_attendance_assertion",aggregateId:saved.id,
        actorPersonId:host.actor.actorPersonId!,payload,
      });
      return {saved:true,duplicate:false,noDeviceEvidence:!paired,corrected:correction,
        notice:"Independent facilitator attestation, not official academic attendance or grant eligibility."};
    });
  });

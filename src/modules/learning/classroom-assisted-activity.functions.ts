import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents, domainEvents, facilitatedRoomActivityReleases,
  facilitatedRoomAssistedActivityEvidence,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { classroomAttestationOpen } from "@/domain/classroom-attendance";
import { requireCanonicalFacilitator } from "./canonical-facilitator-access.server";
import { ownedRoom } from "./facilitated-learning.functions";
import { registeredRoomParticipant } from "./classroom-attendance.functions";
import { requireFacilitatedLearningEnabled } from "./canonical-learning-release.server";

const id=z.string().uuid();
const request=z.object({
  facilitatedSessionId:id,activityReleaseId:id,courseAttemptId:id,
  requestId:id,method:z.enum(["paper","shared_device","verbal"]),
  answerChoice:z.number().int().min(0).max(7).nullable(),
  answerText:z.string().trim().min(1).max(1000).nullable(),
  evidenceNote:z.string().trim().min(15).max(500),
}).strict().refine(x=>(x.answerChoice===null)!==(x.answerText===null),
  "One answer must be supplied");

/** Independent source of paper/shared-device evidence; does NOT fabricate
 * a personally submitted learner response or amend academic grades.
 */
export const recordClassroomAssistedActivity=createServerFn({method:"POST"})
  .validator((raw:unknown)=>request.parse(raw))
  .handler(async({data})=>{
    requireFacilitatedLearningEnabled();
    setResponseHeader("Cache-Control","private, no-store");
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId,true);
      if(!classroomAttestationOpen(room,new Date()))
        throw new AuthorizationError("assisted activity correction window closed");
      const learner=await registeredRoomParticipant(tx,room,data.courseAttemptId);
      const [release]=await tx.select().from(facilitatedRoomActivityReleases)
        .where(and(
          eq(facilitatedRoomActivityReleases.id,data.activityReleaseId),
          eq(facilitatedRoomActivityReleases.facilitatedSessionId,room.id),
        )).limit(1);
      if(!release || (release.answerType==="single_choice" &&
         (data.answerChoice===null || data.answerChoice>=release.choices.length)) ||
         (release.answerType==="text"&&data.answerText===null))
        throw new AuthorizationError("matching released classroom activity");
      const [existing]=await tx.select().from(facilitatedRoomAssistedActivityEvidence)
        .where(and(
          eq(facilitatedRoomAssistedActivityEvidence.facilitatedSessionId,room.id),
          eq(facilitatedRoomAssistedActivityEvidence.requestId,data.requestId),
        )).limit(1);
      if(existing){
        if(existing.activityReleaseId!==data.activityReleaseId ||
          existing.courseAttemptId!==data.courseAttemptId ||
          existing.facilitatorPersonId!==host.actor.actorPersonId ||
          existing.learnerPersonId!==learner.personId ||
          existing.method!==data.method ||
          existing.answerChoice!==data.answerChoice ||
          existing.answerText!==data.answerText ||
          existing.evidenceNote!==data.evidenceNote)
          throw new Error("Conflicting assisted activity retry");
        return {recorded:true,duplicate:true,facilitatorAttributed:true};
      }
      const [saved]=await tx.insert(facilitatedRoomAssistedActivityEvidence).values({
        facilitatedSessionId:room.id,activityReleaseId:release.id,
        courseAttemptId:data.courseAttemptId,learnerPersonId:learner.personId,
        facilitatorPersonId:host.actor.actorPersonId!,
        requestId:data.requestId,method:data.method,
        answerChoice:data.answerChoice,answerText:data.answerText,
        evidenceNote:data.evidenceNote,
      }).returning({id:facilitatedRoomAssistedActivityEvidence.id});
      if(!saved)throw new Error("Assisted practice evidence was not saved");
      const payload={
        facilitatedSessionId:room.id,activityReleaseId:release.id,
        courseAttemptId:data.courseAttemptId,method:data.method,
        facilitatorAttributed:true,
      };
      await tx.insert(auditEvents).values({
        actorPersonId:host.actor.actorPersonId!,
        owningOrganizationId:host.organizationId,
        eventCode:"learning.classroom.assisted_activity.recorded",
        entityKind:"facilitated_room_assisted_activity_evidence",
        entityId:saved.id,payload,
      });
      await tx.insert(domainEvents).values({
        eventType:"ClassroomAssistedActivityRecorded",
        aggregateType:"facilitated_room_assisted_activity_evidence",
        aggregateId:saved.id,actorPersonId:host.actor.actorPersonId!,
        payload,
      });
      return {recorded:true,duplicate:false,facilitatorAttributed:true,
        notice:"Assisted practice is recorded separately from learner-submitted responses and grades."};
    });
  });

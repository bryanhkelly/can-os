import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { facilitatedRoomControlCommands } from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { facilitatedRoomMaxMs } from "@/domain/facilitated-learning";
import { requireCanonicalFacilitator } from "./canonical-facilitator-access.server";
import {
  ownedRoom, validateRoomVideo, representativeAttempt,
} from "./facilitated-learning.functions";
import { assertFacilitatedInstructionalDelivery } from "./student-instructional-tracks.server";
import { requireFacilitatedLearningEnabled } from "./canonical-learning-release.server";

const uuid=z.string().uuid();
const roomInput=z.object({facilitatedSessionId:uuid}).strict();
const commandInput=roomInput.extend({
  requestId:uuid,lessonId:uuid,assetVersionId:uuid,
  commandKind:z.enum(["load","play","pause","seek","stop"]),
  positionSeconds:z.number().int().min(0).max(43200),
}).strict();
function guard(){
  requireFacilitatedLearningEnabled();
  setResponseHeader("Cache-Control","private, no-store");
}
export const getClassroomProjectorCommand=createServerFn({method:"GET"})
  .validator((v:unknown)=>roomInput.parse(v))
  .handler(async({data})=>{
    guard();
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId);
      const [command]=await tx.select().from(facilitatedRoomControlCommands)
        .where(eq(facilitatedRoomControlCommands.facilitatedSessionId,room.id))
        .orderBy(desc(facilitatedRoomControlCommands.issuedAt),
          desc(facilitatedRoomControlCommands.id)).limit(1);
      return {roomState:room.state,
        latest:command?{
          id:command.id,lessonId:command.lessonId,assetVersionId:command.assetVersionId,
          commandKind:command.commandKind,positionSeconds:command.positionSeconds,
          issuedAt:command.issuedAt.toISOString(),
        }:null,
        note:"These are control requests, not evidence that the learner watched media."};
    });
  });
export const issueClassroomProjectorCommand=createServerFn({method:"POST"})
  .validator((v:unknown)=>commandInput.parse(v))
  .handler(async({data})=>{
    guard();
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const room=await ownedRoom(tx,host,data.facilitatedSessionId,true);
      const now=new Date();
      if(room.state!=="live" || !!room.endedAt || room.startedAt>now ||
        now.getTime()-room.startedAt.getTime()>facilitatedRoomMaxMs)
        throw new AuthorizationError("active facilitated classroom");
      const trackVersionId=await validateRoomVideo(tx,room.courseVersionId,
        data.lessonId,data.assetVersionId);
      const attempt=await representativeAttempt(tx,room.deploymentId,room.courseVersionId);
      await assertFacilitatedInstructionalDelivery(tx,attempt,trackVersionId,
        data.lessonId,data.assetVersionId);
      const [saved]=await tx.insert(facilitatedRoomControlCommands).values({
        facilitatedSessionId:room.id,facilitatorPersonId:host.actor.actorPersonId!,
        requestId:data.requestId,lessonId:data.lessonId,
        assetVersionId:data.assetVersionId,commandKind:data.commandKind,
        positionSeconds:data.positionSeconds,
      }).onConflictDoNothing().returning({id:facilitatedRoomControlCommands.id});
      if(!saved){
        const [existing]=await tx.select().from(facilitatedRoomControlCommands).where(and(
          eq(facilitatedRoomControlCommands.facilitatedSessionId,room.id),
          eq(facilitatedRoomControlCommands.requestId,data.requestId),
        )).limit(1);
        if(!existing || existing.facilitatorPersonId!==host.actor.actorPersonId ||
          existing.lessonId!==data.lessonId || existing.assetVersionId!==data.assetVersionId ||
          existing.commandKind!==data.commandKind || existing.positionSeconds!==data.positionSeconds)
          throw new Error("Conflicting projector command retry");
      }
      return {accepted:true,duplicate:!saved,
        note:"Command saved. A projector may require local activation to play media."};
    });
  });

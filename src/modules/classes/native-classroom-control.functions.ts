import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { canonicalClasses, canonicalClassSessions, facilitatedClassroomPlans,
  facilitatedLearningSessions, domainEvents } from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { facilitatedRoomOperationalState } from "@/domain/facilitated-learning";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { assertCurrentCanonicalStaffForMutation } from "@/modules/identity/canonical-transaction-authorization.server";
import { requireFacilitatedLearningEnabled } from "@/modules/learning/canonical-learning-release.server";
import { writeCanonicalAudit, emitCanonicalDomainEvent } from "@/platform/canonical-mutation.server";
import { assertAssignedNativeClassFacilitator, nativeClassForRoom } from "./native-class-room-boundary.server";

const uuid=z.string().uuid();
const transferInput=z.object({
  classId:uuid,classSessionId:uuid,requestId:uuid,
  expectedFacilitatorPersonId:uuid,toPersonId:uuid,
  reason:z.string().trim().min(15).max(500),
}).strict();

/** Independent manager-directed recovery. The immutable Class Session and
 * all learner evidence remain attached to the existing room. Physical
 * coverage and attendance permission are not transferred by this command. */
export const transferNativeClassroomControl=createServerFn({method:"POST"})
  .validator((raw:unknown)=>transferInput.parse(raw))
  .handler(async({data})=>{
    requireFacilitatedLearningEnabled();
    setResponseHeader("Cache-Control","private, no-store");
    setResponseHeader("Referrer-Policy","no-referrer");
    const actor=await getCanonicalCommandContext(getRequest());
    if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??"")||
       actor.actorPersonId===data.toPersonId||data.expectedFacilitatorPersonId===data.toPersonId)
      throw new AuthorizationError("independent Class Site manager and distinct replacement facilitator");
    assertCapability(actor,"class.manage");
    return db.transaction(async tx=>{
      const [cls]=await tx.select().from(canonicalClasses)
        .where(eq(canonicalClasses.id,data.classId)).for("update").limit(1);
      if(!cls?.siteId||actor.scope.organizationIds?.length!==1||
         actor.scope.organizationIds[0]!==cls.operatingOrganizationId||
         actor.scope.siteIds?.length!==1||actor.scope.siteIds[0]!==cls.siteId)
        throw new AuthorizationError("exact Class operating Site");
      const [link]=await tx.select().from(canonicalClassSessions)
        .where(and(eq(canonicalClassSessions.id,data.classSessionId),eq(canonicalClassSessions.classId,cls.id))).limit(1);
      if(!link)throw new AuthorizationError("exact Class Session");
      const [plan]=await tx.select().from(facilitatedClassroomPlans)
        .where(eq(facilitatedClassroomPlans.id,link.classroomPlanId)).for("update").limit(1);
      if(!plan?.facilitatedSessionId||plan.state!=="started")
        throw new AuthorizationError("already-open Class room");
      const [room]=await tx.select().from(facilitatedLearningSessions)
        .where(eq(facilitatedLearningSessions.id,plan.facilitatedSessionId)).for("update").limit(1);
      if(!room || (await nativeClassForRoom(tx,room))?.classSessionId!==link.id)
        throw new AuthorizationError("exact current Class room");
      await assertCurrentCanonicalStaffForMutation(tx,getRequest(),actor);
      const [prior]=await tx.select({payload:domainEvents.payload}).from(domainEvents)
        .where(and(eq(domainEvents.aggregateType,"facilitated_learning_session"),
          eq(domainEvents.aggregateId,room.id),eq(domainEvents.eventType,"ClassroomControlTransferred"),
          sql`${domainEvents.payload}->>'requestId' = ${data.requestId}`)).limit(1);
      if(prior){
        if(prior.payload.fromPersonId!==data.expectedFacilitatorPersonId||
           prior.payload.toPersonId!==data.toPersonId||prior.payload.reason!==data.reason)
          throw new AuthorizationError("conflicting classroom transfer retry");
        return {transferred:true,duplicate:true,facilitatedSessionId:room.id,
          currentFacilitatorPersonId:room.facilitatorPersonId};
      }
      const now=new Date();
      if(facilitatedRoomOperationalState(room,now)!=="live"||
         room.facilitatorPersonId!==data.expectedFacilitatorPersonId)
        throw new AuthorizationError("current live room and unchanged controller");
      await assertAssignedNativeClassFacilitator(tx,cls.id,data.toPersonId,
        cls.operatingOrganizationId,cls.siteId,now);
      const payload={classId:cls.id,classSessionId:link.id,requestId:data.requestId,
        originalFacilitatorPersonId:link.facilitatorPersonId,
        fromPersonId:room.facilitatorPersonId,toPersonId:data.toPersonId,reason:data.reason};
      await tx.update(facilitatedLearningSessions).set({
        facilitatorPersonId:data.toPersonId,pairingExpiresAt:now,
      }).where(eq(facilitatedLearningSessions.id,room.id));
      await writeCanonicalAudit(tx,{actorPersonId:actor.actorPersonId,
        owningOrganizationId:cls.operatingOrganizationId,eventCode:"classroom.control.transferred",
        entityKind:"facilitated_learning_session",entityId:room.id,payload,occurredAt:now});
      await emitCanonicalDomainEvent(tx,{actorPersonId:actor.actorPersonId,
        eventType:"ClassroomControlTransferred",aggregateType:"facilitated_learning_session",
        aggregateId:room.id,payload,occurredAt:now});
      return {transferred:true,duplicate:false,facilitatedSessionId:room.id,
        currentFacilitatorPersonId:data.toPersonId};
    });
  });

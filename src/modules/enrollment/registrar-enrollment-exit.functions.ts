import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { effectiveAttendanceEvents } from "@/domain/effective-attendance";
import { lockAttendanceConfigurationAtSite } from "@/domain/attendance-configuration-lock";
import { EventTypes } from "@/domain/event-types";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { emitEvent, notify, writeAudit } from "@/platform/mutation";

const input=z.object({
 actionId:z.string().uuid(),confirmInstitutionalReview:z.literal(true),
 resolutionNote:z.string().trim().min(20).max(2000),
}).strict();

/** Institutional withdrawal/transfer completion, not a generic task close.
 * One transaction closes the student's current school seats and their
 * school-specific learning grant while retaining historical academic records.
 * A transfer is an exit from the origin, NOT admission to the destination.
 */
export const completeRegistrarEnrollmentExit=createServerFn({method:"POST"})
 .validator((value:unknown)=>input.parse(value))
 .handler(async({data})=>{
 const actor=await getCommandContext(getRequest());
 if(actor.role!=="registrar"||!actor.actorPersonId||actor.demoFacilitator)
   throw new AuthorizationError("real institution registrar");
 assertCapability(actor,"enrollment.activate");
 return db.transaction(async tx=>{
   const [action]=await tx.select().from(s.actions)
     .where(and(eq(s.actions.id,data.actionId),
       eq(s.actions.type,"guardian_enrollment_change_request"),
       eq(s.actions.subjectType,"student_profile")))
     .for("update").limit(1);
   const kind=action?.metadata.kind;
   if(!action||!(kind==="withdrawal"||kind==="transfer")||
      !action.subjectId||!action.siteId||!action.programId||!action.organizationId||
      !actor.scope.siteIds?.includes(action.siteId)||
      !actor.scope.organizationIds?.includes(action.organizationId)||
      !actor.scope.programIds?.includes(action.programId))
     throw new AuthorizationError("current registrar enrollment-exit Action scope");
   if(action.status==="resolved"){
     if(action.metadata.exitCompletedByRegistrar===true)
       return {completed:false as const,alreadyCompleted:true as const};
     throw new Error("This Action was closed without a recorded institutional enrollment exit. Escalate to admissions.");
   }
   if(action.status==="cancelled")throw new Error("The parent request is cancelled");
   const [program]=await tx.select({id:s.programs.id,siteId:s.programs.siteId,
     organizationId:s.programs.organizationId})
     .from(s.programs).where(eq(s.programs.id,action.programId)).limit(1);
   if(!program||program.siteId!==action.siteId||
      program.organizationId!==action.organizationId)
     throw new AuthorizationError("program and school ownership changed");
   const [student]=await tx.select({personId:s.studentProfiles.personId})
     .from(s.studentProfiles).where(eq(s.studentProfiles.id,action.subjectId)).limit(1);
   if(!student)throw new AuthorizationError("current requested student");
   const requestedBy=action.metadata.requestedByGuardianPersonId;
   if(typeof requestedBy!=="string")throw new AuthorizationError("guardian request origin");
   const [guardian]=await tx.select({id:s.guardianRelationships.id})
     .from(s.guardianRelationships).where(guardianRelationshipPredicate({
       guardianPersonId:requestedBy,studentPersonId:student.personId,access:"enrollment",
     })).limit(1);
   if(!guardian)throw new AuthorizationError("requesting guardian no longer verified for enrollment");

   // A registrar must not end a child's school membership while a second
   // process is provisioning access or changing their seats concurrently.
   await lockAttendanceConfigurationAtSite(tx,action.siteId);
   const active=await tx.select({id:s.enrollments.id,kind:s.enrollments.kind,
     schoolYearId:s.enrollments.schoolYearId,sectionId:s.enrollments.sectionId})
     .from(s.enrollments).where(and(
       eq(s.enrollments.studentProfileId,action.subjectId),
       eq(s.enrollments.programId,action.programId),
       inArray(s.enrollments.kind,["program","section"]),
       eq(s.enrollments.status,"active"),
     )).for("update");
   const programSeats=active.filter(row=>row.kind==="program");
   if(!programSeats.length)
     throw new Error("No active enrollment remains at this school. The school must reconcile this request.");

   const [site]=await tx.select({timezone:s.sites.timezone}).from(s.sites)
     .where(eq(s.sites.id,action.siteId)).limit(1);
   if(!site?.timezone)throw new AuthorizationError("school timezone");
   const now=new Date();
   const localDate=(date:Date)=>new Intl.DateTimeFormat("en-CA",{
     timeZone:site.timezone,year:"numeric",month:"2-digit",day:"2-digit",
   }).format(date);
   const today=localDate(now);
   const attendanceRows=await tx.select({
     id:s.attendanceEvents.id,studentProfileId:s.attendanceEvents.studentProfileId,
     programId:s.attendanceEvents.programId,
     occurrenceKey:s.attendanceEvents.occurrenceKey,
     status:s.attendanceEvents.status,recordedAt:s.attendanceEvents.recordedAt,
     expectedAt:s.attendanceEvents.expectedAt,
   }).from(s.attendanceEvents).where(and(
     eq(s.attendanceEvents.studentProfileId,action.subjectId),
     eq(s.attendanceEvents.programId,action.programId),
     eq(s.attendanceEvents.siteId,action.siteId),
     gte(s.attendanceEvents.expectedAt,new Date(now.getTime()-36*60*60*1000)),
     lte(s.attendanceEvents.expectedAt,new Date(now.getTime()+36*60*60*1000)),
   ));
   const onsite=effectiveAttendanceEvents(attendanceRows).some(row=>
     localDate(row.expectedAt)===today&&(row.status==="present"||row.status==="tardy"));
   if(onsite){
     const [released]=await tx.select({id:s.pickupReleaseEvents.id})
       .from(s.pickupReleaseEvents).where(and(
         eq(s.pickupReleaseEvents.studentProfileId,action.subjectId),
         eq(s.pickupReleaseEvents.programId,action.programId),
         eq(s.pickupReleaseEvents.siteId,action.siteId),
         eq(s.pickupReleaseEvents.releaseDate,today),
         eq(s.pickupReleaseEvents.status,"released"),
       )).limit(1);
     if(!released)throw new Error("Student remains checked in onsite without a verified release. Complete the supervised handoff before ending enrollment.");
   }
   const [activeCustodyHold]=await tx.select({id:s.pickupCustodyHolds.id})
     .from(s.pickupCustodyHolds).where(and(
       eq(s.pickupCustodyHolds.studentProfileId,action.subjectId),
       eq(s.pickupCustodyHolds.programId,action.programId),
       eq(s.pickupCustodyHolds.siteId,action.siteId),
       eq(s.pickupCustodyHolds.status,"active"),
     )).limit(1);
   if(activeCustodyHold)throw new Error("Resolve the active pickup custody hold with authorized site leadership before ending enrollment.");
   const nextStatus=kind==="transfer"?"transferred" as const:"withdrawn" as const;
   const seatIds=active.map(row=>row.id);
   const ended=await tx.update(s.enrollments).set({
     status:nextStatus,endedAt:now,updatedAt:now,
   }).where(inArray(s.enrollments.id,seatIds)).returning({id:s.enrollments.id});
   if(ended.length!==seatIds.length)
     throw new Error("The complete program and class enrollment could not be closed");

   // A Site student login may cover several programs; do not revoke it if
   // another actual active Program enrollment at the same Site remains.
   const [otherSiteProgram]=await tx.select({id:s.enrollments.id})
     .from(s.enrollments).innerJoin(s.programs,eq(s.programs.id,s.enrollments.programId))
     .where(and(
       eq(s.enrollments.studentProfileId,action.subjectId),
       eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active"),
       eq(s.programs.siteId,action.siteId),eq(s.programs.organizationId,action.organizationId),
     )).limit(1);
   let grantsRevoked=0;
   let sessionsRevoked=0;
   if(!otherSiteProgram){
     const grants=await tx.select({id:s.accountPersonGrants.id,accountId:s.accountPersonGrants.accountId})
       .from(s.accountPersonGrants).where(and(
         eq(s.accountPersonGrants.personId,student.personId),
         eq(s.accountPersonGrants.role,"student"),
         eq(s.accountPersonGrants.organizationId,action.organizationId),
         eq(s.accountPersonGrants.siteId,action.siteId),
         eq(s.accountPersonGrants.active,true),
       )).for("update");
     if(grants.length){
       const ids=grants.map(row=>row.id);
       const deactivated=await tx.update(s.accountPersonGrants)
         .set({active:false,updatedAt:now}).where(inArray(s.accountPersonGrants.id,ids))
         .returning({id:s.accountPersonGrants.id});
       grantsRevoked=deactivated.length;
       const revoked=await tx.update(s.accessSessions)
         .set({revokedAt:now,updatedAt:now})
         .where(and(inArray(s.accessSessions.activeGrantId,ids),isNull(s.accessSessions.revokedAt)))
         .returning({id:s.accessSessions.id});
       sessionsRevoked=revoked.length;
     }
   }
   const exitMetadata={...action.metadata,exitCompletedByRegistrar:true,
     exitStatus:nextStatus,endedEnrollmentCount:ended.length,
     studentGrantsRevoked:grantsRevoked,
     completedByRegistrarPersonId:actor.actorPersonId};
   const [resolved]=await tx.update(s.actions).set({
     status:"resolved",resolutionNote:data.resolutionNote,
     resolvedAt:now,updatedAt:now,
     metadata:exitMetadata,
   }).where(eq(s.actions.id,action.id)).returning({id:s.actions.id});
   if(!resolved)throw new Error("Could not close the institutional exit request");
   let recordsHandoffActionId:string|null=null;
   if(kind==="transfer"){
     const destination=typeof action.metadata.destinationSchoolName==="string"?
       action.metadata.destinationSchoolName:"Destination school not yet verified";
     const [handoff]=await tx.insert(s.actions).values({
       type:"transfer_academic_records_handoff",status:"open",priority:"high",
       title:"Transfer records handoff · "+destination,
       description:"Verify the destination and the guardian's records authorization. Issue the official transcript with the authorized credit issuer. Record evidence of secure transfer; this Action does not send documents automatically.",
       ownerPersonId:actor.actorPersonId,
       organizationId:action.organizationId,siteId:action.siteId,programId:action.programId,
       subjectType:"student_profile",subjectId:action.subjectId,
       metadata:{
         originChangeActionId:action.id,
         requestedByGuardianPersonId:requestedBy,
         recordsReleaseConsentId:typeof action.metadata.recordsReleaseConsentId==="string"?
           action.metadata.recordsReleaseConsentId:null,
         destinationSchoolName:destination,
         destinationSchoolContactEmail:typeof action.metadata.destinationSchoolContactEmail==="string"?
           action.metadata.destinationSchoolContactEmail:null,
         intendedLastDay:action.metadata.intendedLastDay??null,
         status:"pending_secure_records_release",
       },
     }).returning({id:s.actions.id});
     if(!handoff)throw new Error("Could not create the destination records handoff");
     recordsHandoffActionId=handoff.id;
     await tx.update(s.actions).set({
       metadata:{...exitMetadata,recordsHandoffStatus:"pending",
         recordsHandoffActionId:handoff.id},
     }).where(eq(s.actions.id,action.id));
     await emitEvent(tx,{
       eventType:EventTypes.ActionCreated,aggregateType:"action",
       aggregateId:handoff.id,actorPersonId:actor.actorPersonId,
       organizationId:action.organizationId,siteId:action.siteId,programId:action.programId,
       payload:{type:"transfer_academic_records_handoff",originChangeActionId:action.id},
     });
     await notify(tx,{
       recipientPersonId:actor.actorPersonId!,
       type:"transfer_academic_records_handoff_requested",
       title:"Destination records handoff requires secure completion",
       body:"The student's origin enrollment has ended. Verify the new school's authority, issue official records and record a secure release.",
       resourceType:"action",resourceId:handoff.id,
     });
   }
   await writeAudit(tx,actor,{
     action:"enrollment."+nextStatus,entityType:"student_profile",entityId:action.subjectId,
     scope:{organizationId:action.organizationId,siteId:action.siteId,programId:action.programId},
     before:{activeEnrollmentIds:seatIds},
     after:{status:nextStatus,endedEnrollmentIds:ended.map(row=>row.id),
       grantsRevoked,sessionsRevoked,reason:data.resolutionNote,requestActionId:action.id},
   });
   await emitEvent(tx,{
     eventType:EventTypes.EnrollmentExited,aggregateType:"student_profile",aggregateId:action.subjectId,
     actorPersonId:actor.actorPersonId,
     organizationId:action.organizationId,siteId:action.siteId,programId:action.programId,
     payload:{status:nextStatus,actionId:action.id,endedEnrollmentCount:ended.length},
   });
   await emitEvent(tx,{
     eventType:EventTypes.ActionResolved,aggregateType:"action",aggregateId:action.id,
     actorPersonId:actor.actorPersonId,
     payload:{subjectType:"student_profile",subjectId:action.subjectId},
   });
   await notify(tx,{
     recipientPersonId:requestedBy,type:"guardian_enrollment_change_updated",
     title:kind==="transfer"?"School transfer processed":"School withdrawal processed",
     body:"The school has completed the origin-school enrollment change. Review the official school response. A transfer does not itself enroll your child at another school.",
     resourceType:"action",resourceId:action.id,
   });
   return {completed:true as const,status:nextStatus,endedEnrollmentCount:ended.length,
     grantsRevoked,sessionsRevoked,recordsHandoffActionId};
 });
});

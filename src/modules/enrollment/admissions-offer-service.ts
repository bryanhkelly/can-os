import { db } from "@/db/client";
import { admissionOffers,admissionSeatPools,applications,actions,auditEvents,enrollments,guardianRelationships,journeyRequirements,journeys,programs,schoolYears,studentProfiles } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { transitionAdmissionsOffer,type OfferStatus } from "@/domain/admissions-offer-lifecycle";
import { calculateSeatOccupancy } from "@/domain/admissions-seat-occupancy";
import { lockAttendanceConfigurationAtSite } from "@/domain/attendance-configuration-lock";
import { assertCapability,assertProgramScope,AuthorizationError,type CommandContext } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { assertEnrollmentFormApproved } from "@/domain/enrollment-form";
import { assertRecordWriteAllowed } from "@/modules/_demo/record-write-gate";
import { emitEvent,notify,notifyMany,writeAudit } from "@/platform/mutation";
import { and,eq,inArray } from "drizzle-orm";
import { lockAdmissionsApplication } from "@/domain/admissions-application-lock";
import { assertApplicationOffersAllowed } from "@/domain/admissions-policy";
import { assertFamilyApplicationOfferYear } from "@/domain/family-application-handoff";
import { requireSectionForChurchHostedActivation } from "@/domain/accepted-offer-placement";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";
import { activateSectionEnrollment } from "./section-allocation.service";
import { isVerifiedEnrollmentGuardian } from "@/domain/guardian-offer-visibility";

/** Trusted server-side command service only. No public route or client-supplied CommandContext. */
const guarded=(context:AccessContext,role:"registrar"|"guardian")=>{
 if(context.role!==role||!context.actorPersonId)throw new AuthorizationError("authorized "+role+" admission session");
};
type Transaction=Parameters<Parameters<typeof db.transaction>[0]>[0];
async function requireAdmissionsProgramScope(context:AccessContext,programId:string,tx:Transaction){
 // Guardians must retain an explicit Program grant and a verified relationship.
 // Registrar organization-wide grants instead resolve the Program's current
 // owning organization and Site from the database inside the command transaction.
 if(context.role==="guardian"){
  if(!context.scope.programIds?.includes(programId))throw new AuthorizationError(`program scope: ${programId}`);
  assertProgramScope(context,programId);
  return;
 }
 assertProgramScope(context,programId);
 const [program]=await tx.select({organizationId:programs.organizationId,siteId:programs.siteId})
  .from(programs).where(eq(programs.id,programId)).limit(1);
 if(!program||!context.scope.organizationIds?.includes(program.organizationId)||
   (context.scope.siteIds!==undefined&&(!program.siteId||!context.scope.siteIds.includes(program.siteId))))
  throw new AuthorizationError(`program scope: ${programId}`);
}
async function lockPool(tx:Transaction,programId:string,schoolYearId:string){
 const [pool]=await tx.select().from(admissionSeatPools).where(and(eq(admissionSeatPools.programId,programId),eq(admissionSeatPools.schoolYearId,schoolYearId))).for("update").limit(1);
 if(!pool)throw new Error("A configured seat pool is required");
 const [year]=await tx.select({programId:schoolYears.programId,organizationId:schoolYears.organizationId,siteId:schoolYears.siteId}).from(schoolYears).where(eq(schoolYears.id,schoolYearId)).limit(1);
 const [program]=await tx.select({organizationId:programs.organizationId,siteId:programs.siteId}).from(programs).where(eq(programs.id,programId)).limit(1);
 if(!year||!program||year.organizationId!==program.organizationId||
  (year.programId!==null&&year.programId!==programId)||
  (program.siteId!==null&&year.siteId!==program.siteId)||
  (year.programId===null&&(!program.siteId||year.siteId!==program.siteId)))
  throw new Error("School year does not belong to this program or host site");
 return {pool,organizationId:program.organizationId};
}
async function occupancy(tx:Transaction,programId:string,schoolYearId:string,now:Date){
 const enrolled=await tx.select({studentId:enrollments.studentProfileId}).from(enrollments).where(and(eq(enrollments.programId,programId),eq(enrollments.schoolYearId,schoolYearId),eq(enrollments.kind,"program"),eq(enrollments.status,"active")));

 const offers=await tx.select({status:admissionOffers.status,expiresAt:admissionOffers.expiresAt,studentId:applications.studentProfileId}).from(admissionOffers).innerJoin(applications,eq(applications.id,admissionOffers.applicationId)).where(and(eq(admissionOffers.programId,programId),eq(admissionOffers.schoolYearId,schoolYearId),inArray(admissionOffers.status,["issued","accepted"])));
 return calculateSeatOccupancy(enrolled,offers,now);
}
async function assertGuardian(tx:Transaction,actorId:string|null,studentProfileId:string){
 if(!actorId)throw new Error("Guardian identity required");
 const [profile]=await tx.select({personId:studentProfiles.personId}).from(studentProfiles).where(eq(studentProfiles.id,studentProfileId)).limit(1);
 if(!profile)throw new Error("Student not found");
 const [relationship]=await tx.select({id:guardianRelationships.id,canManageEnrollment:guardianRelationships.canManageEnrollment,metadata:guardianRelationships.metadata}).from(guardianRelationships).where(and(eq(guardianRelationships.studentPersonId,profile.personId),eq(guardianRelationships.guardianPersonId,actorId),eq(guardianRelationships.canManageEnrollment,true))).for("share").limit(1);
 if(!isVerifiedEnrollmentGuardian(relationship))throw new AuthorizationError("Guardian is not authorized for enrollment without independent verification");
}
async function ready(tx:Transaction,applicationId:string){
 const [journey]=await tx.select({id:journeys.id,status:journeys.status}).from(journeys).where(and(eq(journeys.participantType,"application"),eq(journeys.participantId,applicationId))).for("update").limit(1);
 if(!journey||journey.status!=="ready")throw new Error("Enrollment Journey must be ready");
 const blocks=await tx.select({status:journeyRequirements.status,metadata:journeyRequirements.metadata,evidence:journeyRequirements.evidence}).from(journeyRequirements).where(and(eq(journeyRequirements.journeyId,journey.id),eq(journeyRequirements.blocking,true)));
 if(blocks.some(b=>b.status!=="complete"))throw new Error("Blocking requirements remain");
 for(const block of blocks)assertEnrollmentFormApproved(block.metadata,block.evidence);
 return journey;
}
/** Expire elapsed offers while holding the same pool lock used for issuance. */
async function expireElapsedOffers(tx:Transaction,context:CommandContext,programId:string,schoolYearId:string,now:Date){
 const pending=await tx.select({id:admissionOffers.id,expiresAt:admissionOffers.expiresAt}).from(admissionOffers)
  .where(and(eq(admissionOffers.programId,programId),eq(admissionOffers.schoolYearId,schoolYearId),eq(admissionOffers.status,"issued")));
 let count=0;
 for(const offer of pending){
  if(!offer.expiresAt||offer.expiresAt.getTime()>now.getTime())continue;
  await tx.update(admissionOffers).set({status:"expired",updatedAt:now}).where(and(eq(admissionOffers.id,offer.id),eq(admissionOffers.status,"issued")));
  await writeAudit(tx,context,{action:"admissions.offer.expire",entityType:"admission_offer",entityId:offer.id,scope:{programId},before:{status:"issued"},after:{status:"expired"}});
  await emitEvent(tx,{eventType:EventTypes.AdmissionOfferExpired,aggregateType:"admission_offer",aggregateId:offer.id,actorPersonId:context.actorPersonId,payload:{programId,schoolYearId}});
  count++;
 }
 return count;
}
export async function expireSyntheticAdmissionOffers(context:AccessContext,input:{programId:string;schoolYearId:string}){
 guarded(context,"registrar");assertCapability(context,"enrollment.decide");
 if(!context.actorPersonId)throw new Error("Registrar identity required");
 return db.transaction(async tx=>{
  await requireAdmissionsProgramScope(context,input.programId,tx);
  await lockPool(tx,input.programId,input.schoolYearId);
  return expireElapsedOffers(tx,context,input.programId,input.schoolYearId,new Date());
 });
}
export async function issueSyntheticAdmissionOffer(context:AccessContext,input:{applicationId:string;schoolYearId:string;idempotencyKey:string;expiresAt:Date}){
 guarded(context,"registrar");assertCapability(context,"enrollment.decide");
 if(!context.actorPersonId)throw new Error("Staff identity required");
 if(!input.idempotencyKey.trim()||!Number.isFinite(input.expiresAt.getTime())||input.expiresAt.getTime()<=Date.now())throw new Error("Invalid offer issuance input");
 return db.transaction(async tx=>{
  await lockAdmissionsApplication(tx,input.applicationId);
  const [app]=await tx.select().from(applications).where(eq(applications.id,input.applicationId)).limit(1);
  if(!app)throw new Error("Application not found");
  await requireAdmissionsProgramScope(context,app.programId,tx);
  await requireChurchHostedOperatingServices(tx,app.programId,[
    "admissions","school_of_record",
  ]);
  assertRecordWriteAllowed(app.metadata,"registrar");
  assertApplicationOffersAllowed(app);
  assertFamilyApplicationOfferYear(app.metadata,input.schoolYearId);
  const {pool}=await lockPool(tx,app.programId,input.schoolYearId);
  await expireElapsedOffers(tx,context,app.programId,input.schoolYearId,new Date());
  const [retry]=await tx.select().from(admissionOffers).where(eq(admissionOffers.idempotencyKey,input.idempotencyKey)).limit(1);
  if(retry){
   if(retry.applicationId!==app.id||retry.schoolYearId!==input.schoolYearId)throw new Error("Idempotency key reused across applications");
   if(retry.status==="issued"&&retry.expiresAt&&retry.expiresAt.getTime()<=Date.now())throw new Error("Existing offer has expired");
   if(retry.status!=="issued"&&retry.status!=="accepted")throw new Error("Existing offer is no longer actionable");
   return retry.id;
  }
  if(!["application","eligibility"].includes(app.stage))throw new Error("Application stage is not eligible");
  const existingOffers=await tx.select({id:admissionOffers.id,status:admissionOffers.status,expiresAt:admissionOffers.expiresAt}).from(admissionOffers).where(and(eq(admissionOffers.applicationId,app.id),eq(admissionOffers.schoolYearId,input.schoolYearId),inArray(admissionOffers.status,["issued","accepted"])));
  if(existingOffers.some(o=>o.status==="accepted"||(o.status==="issued"&&(!o.expiresAt||o.expiresAt.getTime()>Date.now()))))throw new Error("An active offer already exists for this application and school year");
  await ready(tx,app.id);
  const held=await occupancy(tx,app.programId,input.schoolYearId,new Date());
  if(held>=pool.capacity)throw new Error("Seat pool is full");
  const [offer]=await tx.insert(admissionOffers).values({applicationId:app.id,programId:app.programId,schoolYearId:input.schoolYearId,status:"issued",expiresAt:input.expiresAt,issuedAt:new Date(),issuedByPersonId:context.actorPersonId,idempotencyKey:input.idempotencyKey}).returning({id:admissionOffers.id});
  if(!offer)throw new Error("Offer issuance failed");
  const [profile]=await tx.select({personId:studentProfiles.personId}).from(studentProfiles).where(eq(studentProfiles.id,app.studentProfileId)).limit(1);
  if(!profile)throw new Error("Student profile missing");
  const guardians=await tx.select({personId:guardianRelationships.guardianPersonId,
    canManageEnrollment:guardianRelationships.canManageEnrollment,
    metadata:guardianRelationships.metadata}).from(guardianRelationships)
   .where(and(eq(guardianRelationships.studentPersonId,profile.personId),eq(guardianRelationships.canManageEnrollment,true)));
  // Do not disclose a child's admission offer through a notification to an
  // unverified or revoked prospective guardian, even if a legacy flag is true.
  const verifiedGuardians=guardians.filter(isVerifiedEnrollmentGuardian);
  // status relies on the column default ("unread"), matching the prior inline insert.
  if(verifiedGuardians.length)await notifyMany(tx,[...new Set(verifiedGuardians.map(g=>g.personId))].map(recipientPersonId=>({
   recipientPersonId,type:"admission_offer_issued",title:"New enrollment offer",
   body:"An enrollment offer is ready for your review.",resourceType:"admission_offer",resourceId:offer.id
  })));
  await emitEvent(tx,{eventType:EventTypes.AdmissionOfferIssued,aggregateType:"admission_offer",aggregateId:offer.id,actorPersonId:context.actorPersonId,payload:{applicationId:app.id,programId:app.programId,schoolYearId:input.schoolYearId,expiresAt:input.expiresAt.toISOString()}});
  await writeAudit(tx,context,{action:"admissions.offer.issue",entityType:"admission_offer",entityId:offer.id,scope:{programId:app.programId},after:{status:"issued",schoolYearId:input.schoolYearId}});
  return offer.id;
 });
}
export async function respondToSyntheticAdmissionOffer(context:AccessContext,offerId:string,action:"accept"|"decline"){
 guarded(context,"guardian");assertCapability(context,"enrollment.apply");
 return db.transaction(async tx=>{
  const [lookup]=await tx.select().from(admissionOffers).where(eq(admissionOffers.id,offerId)).limit(1);
  if(!lookup)throw new Error("Offer not found");
  await requireAdmissionsProgramScope(context,lookup.programId,tx);
  await lockAdmissionsApplication(tx,lookup.applicationId);
  await lockPool(tx,lookup.programId,lookup.schoolYearId);
  const [offer]=await tx.select().from(admissionOffers).where(eq(admissionOffers.id,offerId)).limit(1);
  const [app]=await tx.select().from(applications).where(eq(applications.id,offer!.applicationId)).limit(1);
  if(!app||app.programId!==offer!.programId)throw new Error("Offer application mismatch");
  await assertGuardian(tx,context.actorPersonId,app.studentProfileId);
  assertRecordWriteAllowed(app.metadata,"guardian");
  if(action==="accept")assertApplicationOffersAllowed(app);
  if(offer!.status==="accepted"&&action==="accept")return offerId;
  if(offer!.status==="declined"&&action==="decline")return offerId;
  const changed=transitionAdmissionsOffer({status:offer!.status as OfferStatus,applicationId:app.id,schoolYearId:offer!.schoolYearId,expiresAt:offer!.expiresAt?.toISOString()??null},action,new Date());
  if(action==="accept")await ready(tx,app.id);
  const now=new Date();
  await tx.update(admissionOffers).set({status:changed.status,respondedAt:now,respondedByPersonId:context.actorPersonId,updatedAt:now}).where(eq(admissionOffers.id,offerId));
  if(action==="accept")await tx.update(applications).set({stage:"accepted",decidedAt:now,updatedAt:now}).where(eq(applications.id,app.id));
  // status relies on the column default ("unread"), matching the prior inline insert.
  if(offer!.issuedByPersonId)await notify(tx,{
   recipientPersonId:offer!.issuedByPersonId,type:action==="accept"?"admission_offer_accepted":"admission_offer_declined",
   title:action==="accept"?"Enrollment offer accepted":"Enrollment offer declined",
   body:action==="accept"?"A guardian accepted an enrollment offer. Activation may proceed.":"A guardian declined an enrollment offer.",
   resourceType:"admission_offer",resourceId:offerId
  });
  await emitEvent(tx,{eventType:action==="accept"?EventTypes.AdmissionOfferAccepted:EventTypes.AdmissionOfferDeclined,aggregateType:"admission_offer",aggregateId:offerId,actorPersonId:context.actorPersonId,payload:{applicationId:app.id,programId:app.programId,schoolYearId:offer!.schoolYearId}});
  if(action==="accept"&&app.stage!=="accepted")await emitEvent(tx,{eventType:EventTypes.ApplicationAccepted,aggregateType:"application",aggregateId:app.id,actorPersonId:context.actorPersonId,payload:{studentProfileId:app.studentProfileId,programId:app.programId}});
  await writeAudit(tx,context,{action:"admissions.offer."+action,entityType:"admission_offer",entityId:offerId,scope:{programId:app.programId},before:{status:offer!.status},after:{status:changed.status}});
  return offerId;
 });
}
export async function activateSyntheticOfferedEnrollment(context:AccessContext,offerId:string,sectionId?:string){
 guarded(context,"registrar");assertCapability(context,"enrollment.activate");
 return db.transaction(async tx=>{
  const [lookup]=await tx.select().from(admissionOffers).where(eq(admissionOffers.id,offerId)).limit(1);
  if(!lookup)throw new Error("Offer not found");
  await requireAdmissionsProgramScope(context,lookup.programId,tx);
  // Families may apply and accept offers before opening, but an active
  // enrollment is an operating-school record. Lock the Program state so a
  // concurrent closure cannot race this enrollment activation.
  const [openingProgram]=await tx.select({status:programs.status})
   .from(programs).where(eq(programs.id,lookup.programId)).for("share").limit(1);
  if(openingProgram?.status!=="active")
   throw new Error("School must be activated before an accepted offer can become an active enrollment");
  const churchAuthorization=await requireChurchHostedOperatingServices(tx,lookup.programId,[
    "admissions","school_of_record","academic_instruction",
  ]);
  // In church-hosted CAN schools an active enrollment cannot be the terminal
  // handoff. Require a named instructional Section in the SAME transaction.
  requireSectionForChurchHostedActivation(churchAuthorization,sectionId);
  await lockAdmissionsApplication(tx,lookup.applicationId);
  const {pool,organizationId}=await lockPool(tx,lookup.programId,lookup.schoolYearId);
  const [offer]=await tx.select().from(admissionOffers).where(eq(admissionOffers.id,offerId)).limit(1);
  if(offer!.status!=="accepted")throw new Error("Guardian must accept offer first");
  if(!offer!.respondedAt||!offer!.respondedByPersonId)throw new Error("Accepted offer must record a guardian response");
  const [app]=await tx.select().from(applications).where(eq(applications.id,offer!.applicationId)).limit(1);
  if(!app||app.programId!==offer!.programId||app.stage!=="accepted")throw new Error("Application not accepted for this offer");
  assertApplicationOffersAllowed(app);
  await assertGuardian(tx,offer!.respondedByPersonId,app.studentProfileId);
  assertRecordWriteAllowed(app.metadata,"registrar");
  // A receiving school may decide an application and the family may accept
  // the offer while the originating school coordinates its exit. Only actual
  // enrollment activation waits for the verified institutional transfer.
  let transferOrigin: {id:string;siteId:string|null;metadata:Record<string,unknown>}|null=null;
  if(typeof app.metadata.originTransferActionId==="string"){
    const [origin]=await tx.select({
      id:actions.id,type:actions.type,status:actions.status,
      subjectType:actions.subjectType,subjectId:actions.subjectId,
      programId:actions.programId,siteId:actions.siteId,metadata:actions.metadata,
    }).from(actions).where(eq(actions.id,app.metadata.originTransferActionId))
      .for("update").limit(1);
    if(!origin||origin.type!=="guardian_enrollment_change_request"||
       origin.subjectType!=="student_profile"||
       origin.subjectId!==app.studentProfileId||
       !origin.programId||origin.programId===app.programId||
       origin.metadata.kind!=="transfer"||
       origin.metadata.requestedByGuardianPersonId!==app.submittedByPersonId||
       origin.metadata.destinationApplicationId!==app.id||
       origin.metadata.destinationProgramId!==app.programId||
       origin.status!=="resolved"||
       origin.metadata.exitCompletedByRegistrar!==true||
       origin.metadata.exitStatus!=="transferred")
       throw new Error("Originating school must complete the official student transfer before the receiving school can activate enrollment.");
    const [activeOrigin]=await tx.select({id:enrollments.id}).from(enrollments)
      .where(and(eq(enrollments.studentProfileId,app.studentProfileId),
        eq(enrollments.programId,origin.programId),
        eq(enrollments.kind,"program"),eq(enrollments.status,"active"))).limit(1);
    if(activeOrigin)throw new Error("The originating school still has an active Program enrollment. Reconcile the transfer before activating the destination.");
    transferOrigin={id:origin.id,siteId:origin.siteId,metadata:origin.metadata};
  }
  const recordDestinationActivation=async(enrollmentId:string)=>{
    if(!transferOrigin)return;
    await tx.update(actions).set({
      metadata:{...transferOrigin.metadata,
        destinationApplicationId:app.id,
        destinationProgramId:app.programId,
        destinationEnrollmentId:enrollmentId,
        destinationActivatedAt:new Date().toISOString(),
      },
      updatedAt:new Date(),
    }).where(eq(actions.id,transferOrigin.id));
  };
  const [programSite]=await tx.select({siteId:programs.siteId,organizationId:programs.organizationId})
    .from(programs).where(eq(programs.id,offer!.programId)).limit(1);
  if(!programSite||programSite.organizationId!==organizationId)
    throw new Error("Enrollment program must belong to the offer's organization");
  if(transferOrigin){
    if(!programSite.siteId||!transferOrigin.siteId||
       transferOrigin.siteId===programSite.siteId)
      throw new Error("A transfer destination must be an independently authorized school Site, not another Program at the originating school.");
  }
  // Site-less virtual programs have no onsite roster to coordinate.
  if(programSite.siteId)await lockAttendanceConfigurationAtSite(tx,programSite.siteId);
  const [existing]=await tx.select({id:enrollments.id}).from(enrollments).where(and(eq(enrollments.studentProfileId,app.studentProfileId),eq(enrollments.programId,offer!.programId),eq(enrollments.schoolYearId,offer!.schoolYearId),eq(enrollments.status,"active"),eq(enrollments.kind,"program"))).limit(1);
  if(existing){
    if(sectionId)await activateSectionEnrollment(tx,{
      studentProfileId:app.studentProfileId,sectionId,actor:context,
      source:"accepted_offer_activation",applicationId:app.id,
    });
    await recordDestinationActivation(existing.id);
    return existing.id;
  }
  const journey=await ready(tx,app.id);
  if(await occupancy(tx,offer!.programId,offer!.schoolYearId,new Date())>pool.capacity)throw new Error("Seat pool capacity exceeded");
  const [enrollment]=await tx.insert(enrollments).values({studentProfileId:app.studentProfileId,kind:"program",status:"active",organizationId,programId:offer!.programId,schoolYearId:offer!.schoolYearId,startedAt:new Date()}).returning({id:enrollments.id});
  if(!enrollment)throw new Error("Enrollment activation failed");
  // A failed staffing, Section, schedule, capacity or academic-authority
  // check rolls back the Program enrollment, readiness state and all events.
  if(sectionId)await activateSectionEnrollment(tx,{
    studentProfileId:app.studentProfileId,sectionId,actor:context,
    source:"accepted_offer_activation",applicationId:app.id,
  });
  await tx.update(journeys).set({status:"active",completedAt:new Date(),updatedAt:new Date()}).where(eq(journeys.id,journey.id));
  await recordDestinationActivation(enrollment.id);
  const [student]=await tx.select({personId:studentProfiles.personId}).from(studentProfiles).where(eq(studentProfiles.id,app.studentProfileId)).limit(1);
  if(!student)throw new Error("Student profile missing during activation");
  const recipients=[...new Set([student.personId,offer!.respondedByPersonId].filter((id):id is string=>Boolean(id)))];
  // status relies on the column default ("unread"), matching the prior inline insert.
  await notifyMany(tx,recipients.map(recipientPersonId=>({
   recipientPersonId,type:"enrollment_activated",
   title:"Enrollment confirmed",body:"Your accepted admission offer has been activated for the school year.",
   resourceType:"enrollment",resourceId:enrollment.id
  })));

  await emitEvent(tx,{eventType:EventTypes.EnrollmentActivated,aggregateType:"enrollment",aggregateId:enrollment.id,actorPersonId:context.actorPersonId,payload:{applicationId:app.id,studentProfileId:app.studentProfileId,programId:offer!.programId,schoolYearId:offer!.schoolYearId,offerId}});
  await writeAudit(tx,context,{action:"journey.activate",entityType:"journey",entityId:journey.id,scope:{programId:offer!.programId},before:{status:journey.status},after:{status:"active"},contextExtras:{offerId,enrollmentId:enrollment.id}});
  await writeAudit(tx,context,{action:"admissions.offer.activate",entityType:"enrollment",entityId:enrollment.id,scope:{programId:offer!.programId},after:{offerId,schoolYearId:offer!.schoolYearId,status:"active"}});
  return enrollment.id;
 });
}

export async function withdrawAdmissionOffer(context:AccessContext,input:{offerId:string;reason:string}){
 guarded(context,"registrar");assertCapability(context,"enrollment.decide");
 const reason=input.reason.trim();
 if(reason.length<10||reason.length>2000)throw new Error("Withdrawal reason must be 10 to 2000 characters");
 return db.transaction(async tx=>{
  const [lookup]=await tx.select().from(admissionOffers).where(eq(admissionOffers.id,input.offerId)).limit(1);
  if(!lookup)throw new Error("Offer not found");
  await requireAdmissionsProgramScope(context,lookup.programId,tx);
  await lockAdmissionsApplication(tx,lookup.applicationId);
  await lockPool(tx,lookup.programId,lookup.schoolYearId);
  const [offer]=await tx.select().from(admissionOffers).where(eq(admissionOffers.id,input.offerId)).limit(1);
  const [app]=offer?await tx.select().from(applications).where(eq(applications.id,offer.applicationId)).limit(1):[];
  if(!offer||!app||app.programId!==offer.programId)throw new Error("Offer application mismatch");
  assertRecordWriteAllowed(app.metadata,"registrar");
  if(offer.status==="revoked"){
   const [audit]=await tx.select({after:auditEvents.after}).from(auditEvents).where(and(
    eq(auditEvents.resourceId,offer.id),eq(auditEvents.action,"admissions.offer.withdraw"))).limit(1);
   if(audit?.after?.reason!==reason)throw new Error("Offer already withdrawn with a different reason. Refresh to view its status.");
   return {offerId:offer.id};
  }
  if(offer.status!=="issued")throw new Error("Only an unaccepted issued offer can be withdrawn");
  const next=transitionAdmissionsOffer({status:offer.status,expiresAt:offer.expiresAt?.toISOString()??null,
   applicationId:app.id,schoolYearId:offer.schoolYearId},"revoke",new Date());
  await tx.update(admissionOffers).set({status:next.status,updatedAt:new Date()}).where(eq(admissionOffers.id,offer.id));
  await writeAudit(tx,context,{action:"admissions.offer.withdraw",entityType:"admission_offer",entityId:offer.id,
   scope:{programId:offer.programId},before:{status:offer.status},after:{status:next.status,reason}});
  await emitEvent(tx,{eventType:EventTypes.AdmissionOfferRevoked,aggregateType:"admission_offer",aggregateId:offer.id,
   actorPersonId:context.actorPersonId,payload:{applicationId:app.id,programId:offer.programId,schoolYearId:offer.schoolYearId}});
  const [student]=await tx.select({personId:studentProfiles.personId}).from(studentProfiles)
   .where(eq(studentProfiles.id,app.studentProfileId)).limit(1);
  if(!student)throw new Error("Student profile missing");
  const guardians=await tx.select({personId:guardianRelationships.guardianPersonId,
   canManageEnrollment:guardianRelationships.canManageEnrollment,
   metadata:guardianRelationships.metadata}).from(guardianRelationships)
   .where(and(eq(guardianRelationships.studentPersonId,student.personId),eq(guardianRelationships.canManageEnrollment,true)));
  await notifyMany(tx,[...new Set(guardians.filter(isVerifiedEnrollmentGuardian).map(guardian=>guardian.personId))].map(recipientPersonId=>({
   recipientPersonId,type:"admission_offer_withdrawn",title:"Enrollment offer withdrawn",
   body:"Admissions withdrew an unaccepted offer. Contact admissions for next steps.",
   resourceType:"admission_offer",resourceId:offer.id,
  })));
  return {offerId:offer.id};
 });
}

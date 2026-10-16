import {and,eq,inArray} from "drizzle-orm";
import {db} from "@/db/client";
import {admissionOffers,admissionSeatPools,applications,auditEvents,domainEvents,enrollments,guardianRelationships,journeyRequirements,journeys,programs,schoolYears,studentProfiles,notifications} from "@/db/schema";
import {assertCapability,assertProgramScope,type CommandContext} from "@/domain/command-context";
import {EventTypes} from "@/domain/event-types";
import {assertSyntheticMutation} from "@/modules/student-experience/demo-write-gate";
import {transitionAdmissionsOffer,type OfferStatus} from "@/domain/admissions-offer-lifecycle";

/** Trusted server-side command service only. No public route or client-supplied CommandContext. */
const guarded=(role:"registrar"|"guardian")=>assertSyntheticMutation(role);
type Transaction=Parameters<Parameters<typeof db.transaction>[0]>[0];
async function lockPool(tx:Transaction,programId:string,schoolYearId:string){
 const [pool]=await tx.select().from(admissionSeatPools).where(and(eq(admissionSeatPools.programId,programId),eq(admissionSeatPools.schoolYearId,schoolYearId))).for("update").limit(1);
 if(!pool)throw new Error("A configured seat pool is required");
 const [year]=await tx.select({programId:schoolYears.programId,organizationId:schoolYears.organizationId}).from(schoolYears).where(eq(schoolYears.id,schoolYearId)).limit(1);
 const [program]=await tx.select({organizationId:programs.organizationId}).from(programs).where(eq(programs.id,programId)).limit(1);
 if(!year||!program||year.programId!==programId||year.organizationId!==program.organizationId)throw new Error("School year does not belong to program");
 return {pool,organizationId:program.organizationId};
}
async function occupancy(tx:Transaction,programId:string,schoolYearId:string,now:Date){
 const enrolled=await tx.select({studentId:enrollments.studentProfileId}).from(enrollments).where(and(eq(enrollments.programId,programId),eq(enrollments.schoolYearId,schoolYearId),eq(enrollments.kind,"program"),eq(enrollments.status,"active")));
 const activeIds=new Set(enrolled.map(x=>x.studentId));
 const offers=await tx.select({status:admissionOffers.status,expiresAt:admissionOffers.expiresAt,studentId:applications.studentProfileId}).from(admissionOffers).innerJoin(applications,eq(applications.id,admissionOffers.applicationId)).where(and(eq(admissionOffers.programId,programId),eq(admissionOffers.schoolYearId,schoolYearId),inArray(admissionOffers.status,["issued","accepted"])));
 const held=new Set(offers.filter(o=>!activeIds.has(o.studentId)&&(o.status==="accepted"||(o.expiresAt===null||o.expiresAt.getTime()>now.getTime()))).map(o=>o.studentId)).size;
 return activeIds.size+held;
}
async function assertGuardian(tx:Transaction,actorId:string|null,studentProfileId:string){
 if(!actorId)throw new Error("Guardian identity required");
 const [profile]=await tx.select({personId:studentProfiles.personId}).from(studentProfiles).where(eq(studentProfiles.id,studentProfileId)).limit(1);
 if(!profile)throw new Error("Student not found");
 const [relationship]=await tx.select({id:guardianRelationships.id}).from(guardianRelationships).where(and(eq(guardianRelationships.studentPersonId,profile.personId),eq(guardianRelationships.guardianPersonId,actorId),eq(guardianRelationships.canManageEnrollment,true))).limit(1);
 if(!relationship)throw new Error("Guardian is not authorized for enrollment");
}
async function ready(tx:Transaction,applicationId:string){
 const [journey]=await tx.select({id:journeys.id,status:journeys.status}).from(journeys).where(and(eq(journeys.participantType,"application"),eq(journeys.participantId,applicationId))).limit(1);
 if(!journey||journey.status!=="ready")throw new Error("Enrollment Journey must be ready");
 const blocks=await tx.select({status:journeyRequirements.status}).from(journeyRequirements).where(and(eq(journeyRequirements.journeyId,journey.id),eq(journeyRequirements.blocking,true)));
 if(blocks.some(b=>b.status!=="complete"))throw new Error("Blocking requirements remain");
 return journey;
}
/** Expire elapsed synthetic offers while holding the same pool lock used for issuance. */
async function expireElapsedOffers(tx:Transaction,context:CommandContext,programId:string,schoolYearId:string,now:Date){
 const pending=await tx.select({id:admissionOffers.id,expiresAt:admissionOffers.expiresAt,applicationId:admissionOffers.applicationId,metadata:applications.metadata}).from(admissionOffers)
  .innerJoin(applications,eq(applications.id,admissionOffers.applicationId))
  .where(and(eq(admissionOffers.programId,programId),eq(admissionOffers.schoolYearId,schoolYearId),eq(admissionOffers.status,"issued")));
 let count=0;
 for(const offer of pending){
  if(offer.metadata.synthetic!==true||!offer.expiresAt||offer.expiresAt.getTime()>now.getTime())continue;
  await tx.update(admissionOffers).set({status:"expired",updatedAt:now}).where(and(eq(admissionOffers.id,offer.id),eq(admissionOffers.status,"issued")));
  await tx.insert(auditEvents).values({actorPersonId:context.actorPersonId,action:"admissions.offer.expire",resourceType:"admission_offer",resourceId:offer.id,scope:{programId},before:{status:"issued"},after:{status:"expired"},context:{requestId:context.requestId??null}});
  count++;
 }
 return count;
}
export async function expireSyntheticAdmissionOffers(context:CommandContext,input:{programId:string;schoolYearId:string}){
 guarded("registrar");assertCapability(context,"enrollment.decide");assertProgramScope(context,input.programId);
 if(!context.actorPersonId)throw new Error("Registrar identity required");
 return db.transaction(async tx=>{
  await lockPool(tx,input.programId,input.schoolYearId);
  return expireElapsedOffers(tx,context,input.programId,input.schoolYearId,new Date());
 });
}
export async function issueSyntheticAdmissionOffer(context:CommandContext,input:{applicationId:string;schoolYearId:string;idempotencyKey:string;expiresAt:Date}){
 guarded("registrar");assertCapability(context,"enrollment.decide");
 if(!context.actorPersonId)throw new Error("Staff identity required");
 if(!input.idempotencyKey.trim()||!Number.isFinite(input.expiresAt.getTime())||input.expiresAt.getTime()<=Date.now())throw new Error("Invalid offer issuance input");
 return db.transaction(async tx=>{
  const [app]=await tx.select().from(applications).where(eq(applications.id,input.applicationId)).limit(1);
  if(!app||app.metadata.synthetic!==true)throw new Error("Synthetic application not found");
  assertProgramScope(context,app.programId);
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
  const guardians=await tx.select({personId:guardianRelationships.guardianPersonId}).from(guardianRelationships)
   .where(and(eq(guardianRelationships.studentPersonId,profile.personId),eq(guardianRelationships.canManageEnrollment,true)));
  if(guardians.length)await tx.insert(notifications).values([...new Set(guardians.map(g=>g.personId))].map(recipientPersonId=>({
   recipientPersonId,type:"admission_offer_issued",status:"unread" as const,title:"New enrollment offer",
   body:"An enrollment offer is ready for your review.",resourceType:"admission_offer",resourceId:offer.id
  })));
  await tx.insert(domainEvents).values({eventType:EventTypes.AdmissionOfferIssued,aggregateType:"admission_offer",aggregateId:offer.id,actorPersonId:context.actorPersonId,payload:{applicationId:app.id,programId:app.programId,schoolYearId:input.schoolYearId,expiresAt:input.expiresAt.toISOString()}});
  await tx.insert(auditEvents).values({actorPersonId:context.actorPersonId,action:"admissions.offer.issue",resourceType:"admission_offer",resourceId:offer.id,scope:{programId:app.programId},after:{status:"issued",schoolYearId:input.schoolYearId},context:{requestId:context.requestId??null}});
  return offer.id;
 });
}
export async function respondToSyntheticAdmissionOffer(context:CommandContext,offerId:string,action:"accept"|"decline"){
 guarded("guardian");assertCapability(context,"enrollment.apply");
 return db.transaction(async tx=>{
  const [lookup]=await tx.select().from(admissionOffers).where(eq(admissionOffers.id,offerId)).limit(1);
  if(!lookup)throw new Error("Offer not found");
  assertProgramScope(context,lookup.programId);
  await lockPool(tx,lookup.programId,lookup.schoolYearId);
  const [offer]=await tx.select().from(admissionOffers).where(eq(admissionOffers.id,offerId)).limit(1);
  const [app]=await tx.select().from(applications).where(eq(applications.id,offer!.applicationId)).limit(1);
  if(!app||app.metadata.synthetic!==true||app.programId!==offer!.programId)throw new Error("Synthetic offer application mismatch");
  await assertGuardian(tx,context.actorPersonId,app.studentProfileId);
  if(offer!.status==="accepted"&&action==="accept")return offerId;
  if(offer!.status==="declined"&&action==="decline")return offerId;
  const changed=transitionAdmissionsOffer({status:offer!.status as OfferStatus,applicationId:app.id,schoolYearId:offer!.schoolYearId,expiresAt:offer!.expiresAt?.toISOString()??null},action,new Date());
  if(action==="accept")await ready(tx,app.id);
  const now=new Date();
  await tx.update(admissionOffers).set({status:changed.status,respondedAt:now,respondedByPersonId:context.actorPersonId,updatedAt:now}).where(eq(admissionOffers.id,offerId));
  if(action==="accept")await tx.update(applications).set({stage:"accepted",decidedAt:now,updatedAt:now}).where(eq(applications.id,app.id));
  if(offer!.issuedByPersonId)await tx.insert(notifications).values({
   recipientPersonId:offer!.issuedByPersonId,type:action==="accept"?"admission_offer_accepted":"admission_offer_declined",status:"unread",
   title:action==="accept"?"Enrollment offer accepted":"Enrollment offer declined",
   body:action==="accept"?"A guardian accepted an enrollment offer. Activation may proceed.":"A guardian declined an enrollment offer.",
   resourceType:"admission_offer",resourceId:offerId
  });
  await tx.insert(domainEvents).values({eventType:action==="accept"?EventTypes.AdmissionOfferAccepted:EventTypes.AdmissionOfferDeclined,aggregateType:"admission_offer",aggregateId:offerId,actorPersonId:context.actorPersonId,payload:{applicationId:app.id,programId:app.programId,schoolYearId:offer!.schoolYearId}});
  if(action==="accept"&&app.stage!=="accepted")await tx.insert(domainEvents).values({eventType:EventTypes.ApplicationAccepted,aggregateType:"application",aggregateId:app.id,actorPersonId:context.actorPersonId,payload:{studentProfileId:app.studentProfileId,programId:app.programId}});
  await tx.insert(auditEvents).values({actorPersonId:context.actorPersonId,action:"admissions.offer."+action,resourceType:"admission_offer",resourceId:offerId,scope:{programId:app.programId},before:{status:offer!.status},after:{status:changed.status},context:{requestId:context.requestId??null}});
  return offerId;
 });
}
export async function activateSyntheticOfferedEnrollment(context:CommandContext,offerId:string){
 guarded("registrar");assertCapability(context,"enrollment.activate");
 return db.transaction(async tx=>{
  const [lookup]=await tx.select().from(admissionOffers).where(eq(admissionOffers.id,offerId)).limit(1);
  if(!lookup)throw new Error("Offer not found");
  assertProgramScope(context,lookup.programId);
  const {pool,organizationId}=await lockPool(tx,lookup.programId,lookup.schoolYearId);
  const [offer]=await tx.select().from(admissionOffers).where(eq(admissionOffers.id,offerId)).limit(1);
  if(offer!.status!=="accepted")throw new Error("Guardian must accept offer first");
  if(!offer!.respondedAt)throw new Error("Accepted offer must record a guardian response");
  const [app]=await tx.select().from(applications).where(eq(applications.id,offer!.applicationId)).limit(1);
  if(!app||app.metadata.synthetic!==true||app.programId!==offer!.programId||app.stage!=="accepted")throw new Error("Synthetic application not accepted for this offer");
  const [existing]=await tx.select({id:enrollments.id}).from(enrollments).where(and(eq(enrollments.studentProfileId,app.studentProfileId),eq(enrollments.programId,offer!.programId),eq(enrollments.schoolYearId,offer!.schoolYearId),eq(enrollments.status,"active"),eq(enrollments.kind,"program"))).limit(1);
  if(existing)return existing.id;
  const journey=await ready(tx,app.id);
  if(await occupancy(tx,offer!.programId,offer!.schoolYearId,new Date())>pool.capacity)throw new Error("Seat pool capacity exceeded");
  const [enrollment]=await tx.insert(enrollments).values({studentProfileId:app.studentProfileId,kind:"program",status:"active",organizationId,programId:offer!.programId,schoolYearId:offer!.schoolYearId,startedAt:new Date()}).returning({id:enrollments.id});
  if(!enrollment)throw new Error("Enrollment activation failed");
  await tx.update(journeys).set({status:"active",completedAt:new Date(),updatedAt:new Date()}).where(eq(journeys.id,journey.id));
  const [student]=await tx.select({personId:studentProfiles.personId}).from(studentProfiles).where(eq(studentProfiles.id,app.studentProfileId)).limit(1);
  if(!student)throw new Error("Student profile missing during activation");
  const recipients=[...new Set([student.personId,offer!.respondedByPersonId].filter((id):id is string=>Boolean(id)))];
  await tx.insert(notifications).values(recipients.map(recipientPersonId=>({
   recipientPersonId,type:"enrollment_activated",status:"unread" as const,
   title:"Enrollment confirmed",body:"Your accepted admission offer has been activated for the school year.",
   resourceType:"enrollment",resourceId:enrollment.id
  })));

  await tx.insert(domainEvents).values({eventType:EventTypes.EnrollmentActivated,aggregateType:"enrollment",aggregateId:enrollment.id,actorPersonId:context.actorPersonId,payload:{applicationId:app.id,studentProfileId:app.studentProfileId,programId:offer!.programId,schoolYearId:offer!.schoolYearId,offerId}});
  await tx.insert(auditEvents).values({actorPersonId:context.actorPersonId,action:"journey.activate",resourceType:"journey",resourceId:journey.id,scope:{programId:offer!.programId},before:{status:journey.status},after:{status:"active"},context:{requestId:context.requestId??null,offerId,enrollmentId:enrollment.id}});
  await tx.insert(auditEvents).values({actorPersonId:context.actorPersonId,action:"admissions.offer.activate",resourceType:"enrollment",resourceId:enrollment.id,scope:{programId:offer!.programId},after:{offerId,schoolYearId:offer!.schoolYearId,status:"active"},context:{requestId:context.requestId??null}});
  return enrollment.id;
 });
}

import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { EventTypes } from "@/domain/event-types";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { emitEvent, notify, notifyMany, writeAudit } from "@/platform/mutation";

const uuid=z.string().uuid();
const summary=z.string().trim().max(2000);
const change=z.object({
 studentPersonId:uuid,programId:uuid,
 allergySummary:summary,emergencySummary:summary,accommodationSummary:summary,
 emergencyContactName:z.string().trim().max(150),
 emergencyContactPhone:z.string().trim().max(40),
 emergencyContactRelationship:z.string().trim().max(80),
}).strict().refine(v=>!!(v.allergySummary||v.emergencySummary||v.accommodationSummary||
 v.emergencyContactName||v.emergencyContactPhone),{
 message:"Enter the health or emergency contact information that needs school review",
}).refine(v=>!v.emergencyContactName||!!v.emergencyContactPhone,{
 message:"Provide the emergency contact phone number with the name",
});
const review=z.object({actionId:uuid,approve:z.boolean(),
 reviewNote:z.string().trim().min(10).max(1500)}).strict();
const actionType="guardian_health_information_review";
const outstanding=["open","in_progress","waiting"] as const;
type Proposal=z.infer<typeof change> & {guardianPersonId:string;requestedAt:string;actionId:string};

async function parent(){
 const actor=await getCommandContext(getRequest());
 if(actor.role!=="guardian"||!actor.actorPersonId||actor.sessionAccountId)
   throw new AuthorizationError("independently verified guardian");
 assertCapability(actor,"student:related-read");
 return actor;
}
async function medicalRegistrar(){
 const actor=await getCommandContext(getRequest());
 if(actor.role!=="registrar"||!actor.actorPersonId||actor.sessionAccountId)
   throw new AuthorizationError("real school medical-review registrar");
 assertCapability(actor,"health.manage");
 return actor;
}

/** Proposed family information belongs in the restricted medical profile.
 * The Action carries no medical details. Only a separate registrar review
 * promotes it to school-approved emergency information.
 */
export const requestGuardianHealthUpdate=createServerFn({method:"POST"})
 .validator((v:unknown)=>change.parse(v))
 .handler(async({data})=>{
 const actor=await parent();
 return db.transaction(async tx=>{
   const [student]=await tx.select({
     id:s.studentProfiles.id,studentPersonId:s.studentProfiles.personId,
     programId:s.programs.id,organizationId:s.programs.organizationId,
     siteId:s.programs.siteId,
   }).from(s.studentProfiles)
     .innerJoin(s.guardianRelationships,guardianRelationshipPredicate({
       guardianPersonId:actor.actorPersonId!,
       studentPersonId:s.studentProfiles.personId,access:"enrollment",
     }))
     .innerJoin(s.enrollments,and(
       eq(s.enrollments.studentProfileId,s.studentProfiles.id),
       eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active"),
       eq(s.enrollments.programId,data.programId),
     ))
     .innerJoin(s.programs,and(
       eq(s.programs.id,s.enrollments.programId),eq(s.programs.status,"active"),
     ))
     .where(eq(s.studentProfiles.personId,data.studentPersonId)).limit(1);
   if(!student?.siteId||!actor.scope.programIds?.includes(student.programId)||
      !actor.scope.organizationIds?.includes(student.organizationId)||
      !actor.scope.siteIds?.includes(student.siteId))
      throw new AuthorizationError("verified parent and active school enrollment");
   await tx.insert(s.healthProfiles).values({
     studentProfileId:student.id,classification:"medical",
   }).onConflictDoNothing({target:s.healthProfiles.studentProfileId});
   const [profile]=await tx.select({id:s.healthProfiles.id,metadata:s.healthProfiles.metadata})
     .from(s.healthProfiles).where(eq(s.healthProfiles.studentProfileId,student.id))
     .for("update").limit(1);
   if(!profile)throw new Error("Unable to prepare the school's medical review");
   if(profile.metadata.pendingGuardianUpdate)
     throw new Error("A medical or emergency information update is already awaiting school review.");
   const [action]=await tx.insert(s.actions).values({
     type:actionType,status:"open",priority:"high",
     title:"Verified family health information update needs review",
     description:"Review the restricted medical proposal in the authorized health review workspace. Do not paste medical information into this Action.",
     organizationId:student.organizationId,siteId:student.siteId,programId:student.programId,
     subjectType:"student_profile",subjectId:student.id,
     metadata:{requestedByGuardianPersonId:actor.actorPersonId},
   }).returning({id:s.actions.id});
   if(!action)throw new Error("Health review Action was not created");
   const pending:Proposal={...data,guardianPersonId:actor.actorPersonId!,
     requestedAt:new Date().toISOString(),actionId:action.id};
   await tx.update(s.healthProfiles).set({
     metadata:{...profile.metadata,pendingGuardianUpdate:pending},updatedAt:new Date(),
   }).where(eq(s.healthProfiles.id,profile.id));
   const eventId=await emitEvent(tx,{
     eventType:EventTypes.ActionCreated,aggregateType:"action",aggregateId:action.id,
     actorPersonId:actor.actorPersonId,organizationId:student.organizationId,
     siteId:student.siteId,programId:student.programId,
     payload:{type:actionType,studentProfileId:student.id},
   });
   await writeAudit(tx,actor,{
     action:"guardian.health_update.requested",entityType:"health_profile",entityId:profile.id,
     scope:{organizationId:student.organizationId,siteId:student.siteId,programId:student.programId},
     after:{actionId:action.id,status:"pending_review"},contextExtras:{classification:"medical"},
   });
   const operators=await tx.selectDistinct({personId:s.accountPersonGrants.personId})
     .from(s.accountPersonGrants).where(and(
       eq(s.accountPersonGrants.role,"registrar"),
       eq(s.accountPersonGrants.active,true),eq(s.accountPersonGrants.organizationId,student.organizationId),
       sql`(${s.accountPersonGrants.siteId} IS NULL OR ${s.accountPersonGrants.siteId} = ${student.siteId})`,
     )).limit(20);
   await notifyMany(tx,operators.map(row=>({
     recipientPersonId:row.personId,
     type:"guardian_health_review_requested",
     title:"Restricted family emergency information awaiting review",
     body:"A verified parent supplied updated emergency or health details. Open the authorized health review workspace.",
     resourceType:"action",resourceId:action.id,eventId,
   })));
   return {actionId:action.id,status:"pending_review" as const};
 });
});

/** Registrar-only review queue; no general operations list or Site staff
 * screen receives the proposed confidential summaries.
 */
export const listGuardianHealthReviews=createServerFn({method:"GET"})
 .handler(async()=>{
  setResponseHeader("Cache-Control","private, no-store");
  const actor=await medicalRegistrar();
  const rows=await db.select({
    id:s.actions.id,title:s.actions.title,createdAt:s.actions.createdAt,
    studentProfileId:s.actions.subjectId,siteId:s.actions.siteId,programId:s.actions.programId,
    studentName:s.people.legalFirstName,studentLastName:s.people.legalLastName,
    profile:s.healthProfiles.metadata,
    currentAllergySummary:s.healthProfiles.allergySummary,
    currentEmergencySummary:s.healthProfiles.emergencySummary,
    currentAccommodationSummary:s.healthProfiles.accommodationSummary,
  }).from(s.actions)
   .innerJoin(s.healthProfiles,eq(s.healthProfiles.studentProfileId,s.actions.subjectId))
   .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.actions.subjectId))
   .innerJoin(s.people,eq(s.people.id,s.studentProfiles.personId))
   .where(and(
     eq(s.actions.type,actionType),eq(s.actions.subjectType,"student_profile"),
     inArray(s.actions.status,outstanding),
     inArray(s.actions.siteId,actor.scope.siteIds??[]),
     inArray(s.actions.programId,actor.scope.programIds??[]),
     inArray(s.actions.organizationId,actor.scope.organizationIds??[]),
   )).orderBy(desc(s.actions.createdAt)).limit(75);
  return rows.flatMap(row=>{
   const proposed=row.profile.pendingGuardianUpdate as Proposal|undefined;
   if(!proposed||proposed.actionId!==row.id)return [];
   return [{
     id:row.id,studentName:row.studentName+" "+row.studentLastName,
     requestedAt:row.createdAt.toISOString(),
     allergySummary:proposed.allergySummary,
     emergencySummary:proposed.emergencySummary,
     accommodationSummary:proposed.accommodationSummary,
     emergencyContactName:proposed.emergencyContactName,
     emergencyContactPhone:proposed.emergencyContactPhone,
     emergencyContactRelationship:proposed.emergencyContactRelationship,
     currentAllergySummary:row.currentAllergySummary,
     currentEmergencySummary:row.currentEmergencySummary,
     currentAccommodationSummary:row.currentAccommodationSummary,
     currentEmergencyContact:row.profile.approvedEmergencyContact as
       {name:string;phone:string;relationship:string}|undefined,
   }];
  });
 });

export const reviewGuardianHealthUpdate=createServerFn({method:"POST"})
 .validator((v:unknown)=>review.parse(v))
 .handler(async({data})=>{
 const actor=await medicalRegistrar();
 return db.transaction(async tx=>{
   const [action]=await tx.select().from(s.actions).where(and(
     eq(s.actions.id,data.actionId),eq(s.actions.type,actionType),
     eq(s.actions.subjectType,"student_profile"),
   )).for("update").limit(1);
   if(!action?.siteId||!action.programId||!action.organizationId||
      !actor.scope.siteIds?.includes(action.siteId)||
      !actor.scope.organizationIds?.includes(action.organizationId)||
      !actor.scope.programIds?.includes(action.programId))
     throw new AuthorizationError("authorized medical review Action");
   if(action.status==="resolved")return {saved:false as const,alreadyReviewed:true as const};
   if(!outstanding.includes(action.status as typeof outstanding[number]))
     throw new Error("Medical review request has closed");
   const [enrolled]=await tx.select({id:s.enrollments.id}).from(s.enrollments)
     .innerJoin(s.programs,eq(s.programs.id,s.enrollments.programId))
     .where(and(
       eq(s.enrollments.studentProfileId,action.subjectId),
       eq(s.enrollments.programId,action.programId),eq(s.enrollments.kind,"program"),
       eq(s.enrollments.status,"active"),eq(s.programs.siteId,action.siteId),
     )).limit(1);
   if(!enrolled)throw new Error("Student no longer enrolled at this school. Escalate instead of applying unverified information.");
   const [profile]=await tx.select().from(s.healthProfiles)
     .where(eq(s.healthProfiles.studentProfileId,action.subjectId))
     .for("update").limit(1);
   const proposed=profile?.metadata.pendingGuardianUpdate as Proposal|undefined;
   if(!profile||!proposed||proposed.actionId!==action.id||
      proposed.guardianPersonId!==action.metadata.requestedByGuardianPersonId)
     throw new Error("Current original family medical proposal is unavailable");
   const [child]=await tx.select({personId:s.studentProfiles.personId})
     .from(s.studentProfiles).where(eq(s.studentProfiles.id,action.subjectId)).limit(1);
   const [guardian]=child?await tx.select({id:s.guardianRelationships.id})
     .from(s.guardianRelationships).where(guardianRelationshipPredicate({
       guardianPersonId:proposed.guardianPersonId,
       studentPersonId:child.personId,access:"enrollment",
     })).limit(1):[];
   if(!guardian)throw new AuthorizationError("requesting parent has lost verified enrollment access");
   const {pendingGuardianUpdate:_pending,...oldMetadata}=profile.metadata;
   const now=new Date();
   await tx.update(s.healthProfiles).set({
     ...(data.approve?{
       allergySummary:proposed.allergySummary,
       emergencySummary:proposed.emergencySummary,
       accommodationSummary:proposed.accommodationSummary,
     }:{}),
     metadata:{
       ...oldMetadata,
       ...(data.approve?{approvedEmergencyContact:{
         name:proposed.emergencyContactName,
         phone:proposed.emergencyContactPhone,
         relationship:proposed.emergencyContactRelationship,
       }}:{}),
       lastGuardianHealthReview:{
         status:data.approve?"approved":"rejected",reviewedAt:now.toISOString(),
         reviewedByPersonId:actor.actorPersonId,
       },
     },updatedAt:now,
   }).where(eq(s.healthProfiles.id,profile.id));
   await tx.update(s.actions).set({
     status:"resolved",resolvedAt:now,resolutionNote:data.reviewNote,updatedAt:now,
     metadata:{...action.metadata,reviewDecision:data.approve?"approved":"rejected"},
   }).where(eq(s.actions.id,action.id));
   await emitEvent(tx,{
     eventType:EventTypes.ActionResolved,aggregateType:"action",aggregateId:action.id,
     actorPersonId:actor.actorPersonId,
     payload:{type:actionType,decision:data.approve?"approved":"rejected"},
   });
   await writeAudit(tx,actor,{
     action:data.approve?"health.guardian_update.approved":"health.guardian_update.rejected",
     entityType:"health_profile",entityId:profile.id,
     scope:{organizationId:action.organizationId,siteId:action.siteId,programId:action.programId},
     before:{status:"pending_review"},
     after:{status:data.approve?"approved":"rejected",actionId:action.id},
     contextExtras:{classification:"medical"},
   });
   await notify(tx,{
     recipientPersonId:proposed.guardianPersonId,
     type:"guardian_health_review_completed",
     title:data.approve?"School health information updated":"School needs clarification on health information",
     body:"The school completed review of your confidential emergency and health information request. Review your family health page or contact the office.",
     resourceType:"action",resourceId:action.id,
   });
   return {saved:true as const,decision:data.approve?"approved" as const:"rejected" as const};
 });
});

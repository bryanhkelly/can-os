import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { EventTypes } from "@/domain/event-types";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { emitEvent, notifyMany, writeAudit } from "@/platform/mutation";

const uuid=z.string().uuid();
const changeKinds=z.enum(["withdrawal","transfer","family_change"]);
const requestSchema=z.object({
 studentPersonId:uuid,programId:uuid,kind:changeKinds,
 reason:z.string().trim().min(10).max(1500),
 destinationSchoolName:z.string().trim().min(3).max(160).optional(),
 destinationSchoolContactEmail:z.string().trim().email().max(254).optional(),
 intendedLastDay:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
 recordsReleaseAuthorized:z.boolean().optional(),
}).strict().refine(data=>data.kind!=="transfer"||data.recordsReleaseAuthorized===true,{
 path:["recordsReleaseAuthorized"],message:"Authorize an official academic-record release to the named destination school.",
}).refine(data=>data.kind!=="transfer"||!!data.destinationSchoolName,{
 path:["destinationSchoolName"],message:"Name the destination school for a transfer request.",
});
const actionType="guardian_enrollment_change_request";

async function parent(){
 setResponseHeader("Cache-Control","private, no-store");
 const actor=await getCommandContext(getRequest());
 assertCapability(actor,"enrollment.apply");
 if(actor.role!=="guardian"||!actor.actorPersonId||actor.demoFacilitator)
  throw new AuthorizationError("verified family enrollment request");
 return actor;
}

/** A request for the school's registrar, never an automatic enrollment mutation.
 * Existing Actions carry status and resolution: do not create parallel tickets.
 */
export const requestGuardianEnrollmentChange=createServerFn({method:"POST"})
 .validator((value:unknown)=>requestSchema.parse(value))
 .handler(async({data})=>{
  const actor=await parent();
  return db.transaction(async tx=>{
   const [child]=await tx.select({
    studentProfileId:s.studentProfiles.id,
    organizationId:s.programs.organizationId,siteId:s.programs.siteId,
    programId:s.programs.id,
   }).from(s.studentProfiles)
    .innerJoin(s.guardianRelationships,guardianRelationshipPredicate({
      guardianPersonId:actor.actorPersonId!,
      studentPersonId:s.studentProfiles.personId,access:"enrollment",
    }))
    .innerJoin(s.enrollments,and(
      eq(s.enrollments.studentProfileId,s.studentProfiles.id),
      eq(s.enrollments.programId,data.programId),
      eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active"),
    ))
    .innerJoin(s.programs,and(
      eq(s.programs.id,s.enrollments.programId),eq(s.programs.status,"active"),
    ))
    .where(eq(s.studentProfiles.personId,data.studentPersonId)).limit(1);
   if(!child?.siteId||!actor.scope.organizationIds?.includes(child.organizationId)||
      !actor.scope.siteIds?.includes(child.siteId)||
      !actor.scope.programIds?.includes(child.programId))
    throw new AuthorizationError("current enrolled child in original family school scope");
   // Serialize requests for the same child and change type, across browser tabs.
   await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"guardian-change:"+child.studentProfileId+":"+child.programId+":"+data.kind}))`);
   const [existing]=await tx.select({id:s.actions.id,status:s.actions.status})
    .from(s.actions).where(and(
      eq(s.actions.type,actionType),eq(s.actions.subjectType,"student_profile"),
      eq(s.actions.subjectId,child.studentProfileId),
      eq(s.actions.programId,child.programId),
      inArray(s.actions.status,["open","in_progress","waiting"]),
      sql`${s.actions.metadata}->>'kind' = ${data.kind}`,
    )).limit(1);
   if(existing)return {actionId:existing.id,created:false as const,status:existing.status};
   const [action]=await tx.insert(s.actions).values({
    type:actionType,status:"open",priority:"high",
    title:data.kind==="withdrawal"?"Guardian requests enrollment withdrawal":
      data.kind==="transfer"?"Guardian requests student transfer":
      "Guardian requests family record change",
    description:data.reason,organizationId:child.organizationId,
    siteId:child.siteId,programId:child.programId,
    subjectType:"student_profile",subjectId:child.studentProfileId,
    metadata:{requestedByGuardianPersonId:actor.actorPersonId,kind:data.kind,
      ...(data.kind==="transfer"?{
        destinationSchoolName:data.destinationSchoolName,
        destinationSchoolContactEmail:data.destinationSchoolContactEmail??null,
        intendedLastDay:data.intendedLastDay??null,
        recordsHandoffStatus:"not_started",
      }:{}),
    },
   }).returning({id:s.actions.id});
   if(!action)throw new Error("Unable to create family enrollment request");
   if(data.kind==="transfer"){
     const [consent]=await tx.insert(s.consentRecords).values({
       subjectType:"student_profile",subjectId:child.studentProfileId,
       consentType:"academic_records_transfer_release",
       signerPersonId:actor.actorPersonId!,
       version:"can-school-transfer-release-v1",
       signatureEvidence:{
         acknowledged:true,
         purpose:"Release existing academic records to the verified named destination school only",
         destinationSchoolName:data.destinationSchoolName,
         destinationSchoolContactEmail:data.destinationSchoolContactEmail??null,
         studentPersonId:data.studentPersonId,programId:child.programId,
         guardianPersonId:actor.actorPersonId,
         actionId:action.id,
       },
     }).returning({id:s.consentRecords.id});
     if(!consent)throw new Error("Transfer records release authorization was not recorded");
     await tx.update(s.actions).set({
       metadata:{requestedByGuardianPersonId:actor.actorPersonId,kind:data.kind,
         destinationSchoolName:data.destinationSchoolName,
         destinationSchoolContactEmail:data.destinationSchoolContactEmail??null,
         intendedLastDay:data.intendedLastDay??null,
         recordsHandoffStatus:"not_started",recordsReleaseConsentId:consent.id,
       },
     }).where(eq(s.actions.id,action.id));
   }
   const eventId=await emitEvent(tx,{
    eventType:EventTypes.ActionCreated,aggregateType:"action",aggregateId:action.id,
    actorPersonId:actor.actorPersonId,
    organizationId:child.organizationId,siteId:child.siteId,programId:child.programId,
    payload:{type:actionType,studentProfileId:child.studentProfileId,kind:data.kind},
   });
   await writeAudit(tx,actor,{
    action:"guardian.enrollment_change.requested",
    entityType:"action",entityId:action.id,
    scope:{organizationId:child.organizationId,siteId:child.siteId,programId:child.programId},
    after:{kind:data.kind,studentProfileId:child.studentProfileId,
      ...(data.kind==="transfer"?{
        destinationSchoolName:data.destinationSchoolName,
        intendedLastDay:data.intendedLastDay??null,
      }:{}),
    },
   });
   const operators=await tx.selectDistinct({personId:s.accountPersonGrants.personId})
    .from(s.accountPersonGrants)
    .innerJoin(s.accessAccounts,and(
      eq(s.accessAccounts.id,s.accountPersonGrants.accountId),
      eq(s.accessAccounts.disabled,false),
    ))
    .where(and(
      eq(s.accountPersonGrants.role,"registrar"),
      eq(s.accountPersonGrants.active,true),
      eq(s.accountPersonGrants.isSynthetic,false),
      eq(s.accountPersonGrants.organizationId,child.organizationId),
      or(isNull(s.accountPersonGrants.siteId),eq(s.accountPersonGrants.siteId,child.siteId)),
    )).limit(20);
   await notifyMany(tx,operators.map(operator=>({
     recipientPersonId:operator.personId,
     type:"guardian_enrollment_change_requested",
     title:"Family enrollment request needs review",
     body:"A verified guardian requested a school record or enrollment change. Review the assigned school Actions.",
     resourceType:"action",resourceId:action.id,eventId,
   })));
   return {actionId:action.id,created:true as const,status:"open" as const};
  });
 });

export const listGuardianEnrollmentChanges=createServerFn({method:"GET"})
 .validator((value:unknown)=>z.object({studentPersonId:uuid.optional()}).strict().parse(value??{}))
 .handler(async({data})=>{
  const actor=await parent();
  const rows=await db.select({
    id:s.actions.id,title:s.actions.title,status:s.actions.status,
    description:s.actions.description,resolutionNote:s.actions.resolutionNote,
    createdAt:s.actions.createdAt,updatedAt:s.actions.updatedAt,
    kind:s.actions.metadata,programId:s.actions.programId,
    studentPersonId:s.studentProfiles.personId,
    schoolName:s.programs.name,
   }).from(s.actions)
   .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.actions.subjectId))
   .innerJoin(s.guardianRelationships,guardianRelationshipPredicate({
     guardianPersonId:actor.actorPersonId!,studentPersonId:s.studentProfiles.personId,
     access:"enrollment",
   }))
   .innerJoin(s.programs,eq(s.programs.id,s.actions.programId))
   .where(and(
     eq(s.actions.type,actionType),eq(s.actions.subjectType,"student_profile"),
     // A family retains access to its OWN completed request after origin
     // enrollment ends; the old school's Program scope can be revoked.
     sql`${s.actions.metadata}->>'requestedByGuardianPersonId' = ${actor.actorPersonId!}`,
     ...(data.studentPersonId?[eq(s.studentProfiles.personId,data.studentPersonId)]:[]),
   )).orderBy(desc(s.actions.createdAt)).limit(50);
  return {items:rows.filter(row=>row.kind.requestedByGuardianPersonId===actor.actorPersonId)
    .map(row=>({
      id:row.id,kind:changeKinds.safeParse(row.kind.kind).success ? changeKinds.parse(row.kind.kind) : "unknown",
      destinationSchoolName:typeof row.kind.destinationSchoolName==="string"?row.kind.destinationSchoolName:null,
      destinationSchoolContactEmail:typeof row.kind.destinationSchoolContactEmail==="string"?row.kind.destinationSchoolContactEmail:null,
      destinationFamilyStartProgramName:typeof row.kind.destinationFamilyStartProgramName==="string"?row.kind.destinationFamilyStartProgramName:null,
      destinationFamilyStartRequestedAt:typeof row.kind.destinationFamilyStartRequestedAt==="string"?row.kind.destinationFamilyStartRequestedAt:null,
      intendedLastDay:typeof row.kind.intendedLastDay==="string"?row.kind.intendedLastDay:null,
      recordsHandoffStatus:typeof row.kind.recordsHandoffStatus==="string"?row.kind.recordsHandoffStatus:null,
      recordsReleasedInternally:row.kind.recordsReleasedInternally===true,
      destinationApplicationId:typeof row.kind.destinationApplicationId==="string"?row.kind.destinationApplicationId:null,
      destinationEnrollmentActivated:typeof row.kind.destinationEnrollmentId==="string"&&
        typeof row.kind.destinationActivatedAt==="string",
      schoolName:row.schoolName,studentPersonId:row.studentPersonId,
      title:row.title,status:row.status,
      description:row.description??"",resolutionNote:row.resolutionNote??null,
      createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),
    }))};
 });

/** Request choices come from verified relationships and current actual Program
 * enrollments, never client-supplied school IDs or a stale class placement.
 */
export const getGuardianEnrollmentChangeOptions=createServerFn({method:"GET"})
 .handler(async()=>{
  const actor=await parent();
  const rows=await db.select({
    studentPersonId:s.studentProfiles.personId,
    firstName:s.people.legalFirstName,lastName:s.people.legalLastName,
    programId:s.programs.id,schoolName:s.programs.name,
  }).from(s.guardianRelationships)
   .innerJoin(s.studentProfiles,eq(s.studentProfiles.personId,s.guardianRelationships.studentPersonId))
   .innerJoin(s.people,eq(s.people.id,s.studentProfiles.personId))
   .innerJoin(s.enrollments,and(
     eq(s.enrollments.studentProfileId,s.studentProfiles.id),
     eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active"),
   ))
   .innerJoin(s.programs,and(
     eq(s.programs.id,s.enrollments.programId),eq(s.programs.status,"active"),
   ))
   .where(and(
     guardianRelationshipPredicate({guardianPersonId:actor.actorPersonId!,access:"enrollment"}),
     inArray(s.programs.id,actor.scope.programIds??[]),
     inArray(s.programs.siteId,actor.scope.siteIds??[]),
     inArray(s.programs.organizationId,actor.scope.organizationIds??[]),
   )).limit(100);
  return [...new Map(rows.map(row=>[row.studentPersonId+":"+row.programId,{
    studentPersonId:row.studentPersonId,studentName:row.firstName+" "+row.lastName,
    programId:row.programId,schoolName:row.schoolName,
  }])).values()];
 });

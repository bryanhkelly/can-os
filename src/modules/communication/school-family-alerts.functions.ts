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
const alertKinds=z.enum(["urgent_school_update","schedule_change","school_closure"]);
const publishInput=z.object({
 programId:uuid,kind:alertKinds,
 title:z.string().trim().min(8).max(160),
 message:z.string().trim().min(20).max(3000),
 mutationId:uuid,confirmed:z.literal(true),
}).strict();
const actionType="school_family_bulletin";

async function registrar(){
 const actor=await getCommandContext(getRequest());
 if(actor.role!=="registrar"||!actor.actorPersonId||actor.demoFacilitator)
  throw new AuthorizationError("real institutional school registrar");
 assertCapability(actor,"communication.send");
 if(!actor.scope.organizationIds?.length||!actor.scope.siteIds?.length||
    !actor.scope.programIds?.length)
  throw new AuthorizationError("school announcement program scope");
 return actor;
}

/** A signed, scoped school Action is the canonical announcement. Notifications
 * are delivery receipts, not a second mutable bulletin model. Publishing does
 * not alter calendars, school opening authorization, or onsite supervision.
 */
export const publishSchoolFamilyAlert=createServerFn({method:"POST"})
 .validator((value:unknown)=>publishInput.parse(value))
 .handler(async({data})=>{
 const actor=await registrar();
 return db.transaction(async tx=>{
   const [program]=await tx.select({
     id:s.programs.id,organizationId:s.programs.organizationId,
     siteId:s.programs.siteId,status:s.programs.status,
     name:s.programs.name,
   }).from(s.programs).where(eq(s.programs.id,data.programId)).limit(1);
   if(!program?.siteId||program.status!=="active"||
     !actor.scope.organizationIds?.includes(program.organizationId)||
     !actor.scope.siteIds?.includes(program.siteId)||
     !actor.scope.programIds?.includes(program.id))
    throw new AuthorizationError("active scoped school for family alert");
   const sourceKey="family-bulletin:"+data.mutationId;
   await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${sourceKey}))`);
   const [retry]=await tx.select({id:s.actions.id,metadata:s.actions.metadata})
     .from(s.actions).where(and(eq(s.actions.type,actionType),
       sql`${s.actions.metadata}->>'sourceKey' = ${sourceKey}`)).limit(1);
   if(retry){
     if(retry.metadata.programId!==data.programId||
        retry.metadata.kind!==data.kind||
        retry.metadata.title!==data.title||
        retry.metadata.message!==data.message)
       throw new Error("This announcement request ID has already been used for different content.");
     return {published:false as const,alertId:retry.id,
       recipientCount:Number(retry.metadata.recipientCount??0)};
   }
   // Only independently verified enrollment guardians of ACTIVE students
   // with an active login grant at this school receive the family bulletin.
   const recipientRows=await tx.selectDistinct({personId:s.guardianRelationships.guardianPersonId})
     .from(s.enrollments)
     .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.enrollments.studentProfileId))
     .innerJoin(s.guardianRelationships,guardianRelationshipPredicate({
       studentPersonId:s.studentProfiles.personId,access:"enrollment",
     }))
     .innerJoin(s.accountPersonGrants,and(
       eq(s.accountPersonGrants.personId,s.guardianRelationships.guardianPersonId),
       eq(s.accountPersonGrants.role,"guardian"),
       eq(s.accountPersonGrants.active,true),
       eq(s.accountPersonGrants.isSynthetic,false),
       eq(s.accountPersonGrants.organizationId,program.organizationId),
       or(isNull(s.accountPersonGrants.siteId),
         eq(s.accountPersonGrants.siteId,program.siteId)),
     ))
     .innerJoin(s.accessAccounts,and(
       eq(s.accessAccounts.id,s.accountPersonGrants.accountId),
       eq(s.accessAccounts.disabled,false),
     ))
     .innerJoin(s.people,and(
       eq(s.people.id,s.guardianRelationships.guardianPersonId),
       eq(s.people.active,true),
     ))
     .where(and(eq(s.enrollments.programId,program.id),
       eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active")));
   const [action]=await tx.insert(s.actions).values({
     type:actionType,status:"resolved",priority:"urgent",
     title:data.title,description:data.message,
     ownerPersonId:actor.actorPersonId,
     organizationId:program.organizationId,siteId:program.siteId,
     programId:program.id,subjectType:"program",subjectId:program.id,
     resolvedAt:new Date(),
     metadata:{
       sourceKey,programId:program.id,kind:data.kind,title:data.title,
       message:data.message,recipientCount:recipientRows.length,
       publishedByPersonId:actor.actorPersonId,publishedAt:new Date().toISOString(),
     },
   }).returning({id:s.actions.id});
   if(!action)throw new Error("Could not publish school announcement");
   const eventId=await emitEvent(tx,{
     eventType:EventTypes.ActionCreated,aggregateType:"action",aggregateId:action.id,
     actorPersonId:actor.actorPersonId,organizationId:program.organizationId,
     siteId:program.siteId,programId:program.id,
     payload:{type:actionType,kind:data.kind,recipientCount:recipientRows.length},
   });
   for(let offset=0;offset<recipientRows.length;offset+=100){
     await notifyMany(tx,recipientRows.slice(offset,offset+100).map(recipient=>({
       recipientPersonId:recipient.personId,type:"school_family_alert",
       title:data.kind==="school_closure"?"School closure update: "+data.title:data.title,
       body:data.message,
       resourceType:"action",resourceId:action.id,eventId,
     })));
   }
   await writeAudit(tx,actor,{
     action:"school.family_alert.published",entityType:"action",entityId:action.id,
     scope:{organizationId:program.organizationId,siteId:program.siteId,programId:program.id},
     after:{kind:data.kind,title:data.title,recipientCount:recipientRows.length},
   });
   return {published:true as const,alertId:action.id,recipientCount:recipientRows.length};
 });
});

/** Publisher can inspect published bulletin and exact in-app acknowledgement
 * counts without claiming an email/SMS delivery or family awareness. */
export const getSchoolFamilyAlerts=createServerFn({method:"GET"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");
 const actor=await registrar();
 const [programs,alerts]=await Promise.all([
   db.select({id:s.programs.id,name:s.programs.name,siteName:s.sites.name})
    .from(s.programs).innerJoin(s.sites,eq(s.sites.id,s.programs.siteId))
    .where(and(eq(s.programs.status,"active"),
      inArray(s.programs.id,actor.scope.programIds??[]),
      inArray(s.programs.siteId,actor.scope.siteIds??[]),
      inArray(s.programs.organizationId,actor.scope.organizationIds??[]))),
   db.select({id:s.actions.id,title:s.actions.title,
     description:s.actions.description,createdAt:s.actions.createdAt,
     programId:s.actions.programId,metadata:s.actions.metadata,
   }).from(s.actions).where(and(
     eq(s.actions.type,actionType),
     inArray(s.actions.programId,actor.scope.programIds??[]),
     inArray(s.actions.siteId,actor.scope.siteIds??[]),
     inArray(s.actions.organizationId,actor.scope.organizationIds??[]),
   )).orderBy(desc(s.actions.createdAt)).limit(30),
 ]);
 const counts=alerts.length?await db.select({
   alertId:s.notifications.resourceId,status:s.notifications.status,
 }).from(s.notifications).where(and(
   eq(s.notifications.type,"school_family_alert"),
   eq(s.notifications.resourceType,"action"),
   inArray(s.notifications.resourceId,alerts.map(row=>row.id)),
 )):[];
 return {programs,items:alerts.map(row=>({
   id:row.id,title:row.title,description:row.description??"",
   programId:row.programId,kind:row.metadata.kind,
   publishedAt:row.createdAt.toISOString(),
   recipients:counts.filter(item=>item.alertId===row.id).length,
   acknowledged:counts.filter(item=>item.alertId===row.id&&item.status==="read").length,
 }))};
});

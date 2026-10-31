import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { sendNotificationEmail } from "./notification-email.server";
import { getNotificationPreferences, nextAllowedDelivery, sendOptedInSms } from "@/platform/subscriptions/preferences";

const MAX_ATTEMPTS=5;
const LEASE_MS=120_000;
const RETRY_MS=(attempt:number)=>Math.min(60_000*2**Math.max(0,attempt-1),3_600_000);

/** A scheduled transport worker; never send from inside the publication
 * transaction. Notification and original school Action remain authoritative.
 * Each retry verifies current enrollment and verified guardian grant.
 */
export async function processSchoolFamilyOutboundDeliveries(now=new Date(),limit=120){
 const ids=await db.transaction(async tx=>{
   const due=await tx.select({id:s.notificationOutboundDeliveries.id})
     .from(s.notificationOutboundDeliveries)
     .where(or(
       and(eq(s.notificationOutboundDeliveries.status,"pending"),
         or(isNull(s.notificationOutboundDeliveries.nextAttemptAt),
            lte(s.notificationOutboundDeliveries.nextAttemptAt,now))),
       and(eq(s.notificationOutboundDeliveries.status,"failed"),
         lte(s.notificationOutboundDeliveries.nextAttemptAt,now)),
       and(eq(s.notificationOutboundDeliveries.status,"processing"),
         lte(s.notificationOutboundDeliveries.leaseUntil,now)),
     )).orderBy(asc(s.notificationOutboundDeliveries.createdAt))
     .limit(limit).for("update",{skipLocked:true});
   if(due.length)await tx.update(s.notificationOutboundDeliveries)
     .set({status:"processing",leaseUntil:new Date(now.getTime()+LEASE_MS),
       updatedAt:now})
     .where(inArray(s.notificationOutboundDeliveries.id,due.map(row=>row.id)));
   return due.map(row=>row.id);
 });
 let accepted=0;
 const processOne=async(id:string)=>{
   try{
     const [record]=await db.select({
       delivery:s.notificationOutboundDeliveries,
       recipientPersonId:s.notifications.recipientPersonId,
       notificationType:s.notifications.type,
       resourceType:s.notifications.resourceType,
       actionId:s.actions.id,actionType:s.actions.type,
       title:s.notifications.title,message:s.notifications.body,
       programId:s.actions.programId,siteId:s.actions.siteId,
       organizationId:s.actions.organizationId,
     }).from(s.notificationOutboundDeliveries)
       .innerJoin(s.notifications,eq(s.notifications.id,s.notificationOutboundDeliveries.notificationId))
       .innerJoin(s.actions,eq(s.actions.id,s.notifications.resourceId))
       .where(eq(s.notificationOutboundDeliveries.id,id)).limit(1);
     if(!record||record.delivery.status!=="processing"){
       return;
     }
     const suppress=async(reason:string)=>{
       await db.update(s.notificationOutboundDeliveries).set({
         status:"suppressed",lastError:reason,leaseUntil:null,nextAttemptAt:null,updatedAt:new Date(),
       }).where(and(eq(s.notificationOutboundDeliveries.id,id),
         eq(s.notificationOutboundDeliveries.status,"processing")));
     };
     if(record.notificationType!=="school_family_alert"||
        record.resourceType!=="action"||record.actionType!=="school_family_bulletin"||
        !record.programId||!record.siteId||!record.organizationId){
       await suppress("invalid_school_alert");return;
     }
     // Never use a cached recipient list as ongoing permission. A guardian
     // whose child transferred or lost verified enrollment rights is excluded.
     const [current]=await db.select({id:s.guardianRelationships.id})
       .from(s.guardianRelationships)
       .innerJoin(s.studentProfiles,eq(s.studentProfiles.personId,s.guardianRelationships.studentPersonId))
       .innerJoin(s.enrollments,and(
         eq(s.enrollments.studentProfileId,s.studentProfiles.id),
         eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active"),
         eq(s.enrollments.programId,record.programId),
       ))
       .innerJoin(s.programs,and(
         eq(s.programs.id,s.enrollments.programId),
         eq(s.programs.siteId,record.siteId),
         eq(s.programs.organizationId,record.organizationId),
         eq(s.programs.status,"active"),
       ))
       .innerJoin(s.accountPersonGrants,and(
         eq(s.accountPersonGrants.personId,s.guardianRelationships.guardianPersonId),
         eq(s.accountPersonGrants.role,"guardian"),eq(s.accountPersonGrants.active,true),
         eq(s.accountPersonGrants.isSynthetic,false),
         eq(s.accountPersonGrants.organizationId,record.organizationId),
         or(isNull(s.accountPersonGrants.siteId),
           eq(s.accountPersonGrants.siteId,record.siteId)),
       ))
       .innerJoin(s.accessAccounts,and(
         eq(s.accessAccounts.id,s.accountPersonGrants.accountId),
         eq(s.accessAccounts.disabled,false),
       ))
       .innerJoin(s.people,and(
         eq(s.people.id,s.guardianRelationships.guardianPersonId),eq(s.people.active,true),
       ))
       .where(guardianRelationshipPredicate({
         guardianPersonId:record.recipientPersonId,access:"enrollment",
       })).limit(1);
     if(!current){await suppress("guardian_enrollment_access_revoked");return;}
     const prefs=await getNotificationPreferences(record.recipientPersonId);
     if(record.delivery.channel==="sms"&&
        (!prefs?.smsOptedIn||!prefs.smsVerifiedPhone||!prefs.smsVerifiedAt)){
       await suppress("sms_opt_in_or_verified_phone_missing");return;
     }
     const quietUntil=prefs?nextAllowedDelivery(now,prefs.timezone,prefs.quietStart,prefs.quietEnd):null;
     if(quietUntil){
       await db.update(s.notificationOutboundDeliveries).set({
         status:"pending",leaseUntil:null,nextAttemptAt:quietUntil,updatedAt:new Date(),
       }).where(and(eq(s.notificationOutboundDeliveries.id,id),
         eq(s.notificationOutboundDeliveries.status,"processing")));
       return;
     }
     let ok=false;
     let terminal=false;
     let failure="provider_not_accepted";
     if(record.delivery.channel==="email"){
       const [mail]=await db.select({email:s.accessAccounts.emailNormalized})
         .from(s.accountPersonGrants)
         .innerJoin(s.accessAccounts,eq(s.accessAccounts.id,s.accountPersonGrants.accountId))
         .where(and(
           eq(s.accountPersonGrants.personId,record.recipientPersonId),
           eq(s.accountPersonGrants.role,"guardian"),
           eq(s.accountPersonGrants.organizationId,record.organizationId),
           or(isNull(s.accountPersonGrants.siteId),
             eq(s.accountPersonGrants.siteId,record.siteId)),
           eq(s.accountPersonGrants.active,true),
           eq(s.accountPersonGrants.isSynthetic,false),
           eq(s.accessAccounts.disabled,false),
         )).limit(1);
       if(!mail?.email){terminal=true;failure="no_active_school_email";}
       else ok=await sendNotificationEmail({
         to:mail.email,subject:record.title,
         text:record.message??record.title,
       },id);
     }else if(record.delivery.channel==="sms"){
       // SMS text deliberately excludes the arbitrary school-authored body.
       // An opted-in guardian opens CAN for full, current authorized details.
       ok=await sendOptedInSms(prefs!.smsVerifiedPhone!,
         "CAN OS: Your school has issued an urgent family update. Sign in to review current instructions.");
     }else{
       terminal=true;failure="unsupported_channel";
     }
     const attempts=record.delivery.attempts+1;
     const updated=await db.update(s.notificationOutboundDeliveries).set({
       status:ok?"accepted":"failed",attempts,
       acceptedAt:ok?new Date():null,
       lastError:ok?null:failure,
       nextAttemptAt:ok||terminal||attempts>=MAX_ATTEMPTS
         ?null:new Date(now.getTime()+RETRY_MS(attempts)),
       leaseUntil:null,updatedAt:new Date(),
     }).where(and(eq(s.notificationOutboundDeliveries.id,id),
       eq(s.notificationOutboundDeliveries.status,"processing")))
       .returning({id:s.notificationOutboundDeliveries.id});
     if(ok&&updated.length)accepted++;
   }catch{
     // Delivery errors are retried independently; never lose the published
     // in-app notice or leak recipient/contact details to error messages.
     const [row]=await db.select({attempts:s.notificationOutboundDeliveries.attempts})
       .from(s.notificationOutboundDeliveries)
       .where(eq(s.notificationOutboundDeliveries.id,id)).limit(1);
     const attempts=(row?.attempts??0)+1;
     await db.update(s.notificationOutboundDeliveries).set({
       status:"failed",attempts,lastError:"delivery_worker_error",
       leaseUntil:null,
       nextAttemptAt:attempts>=MAX_ATTEMPTS?null:new Date(now.getTime()+RETRY_MS(attempts)),
       updatedAt:new Date(),
     }).where(eq(s.notificationOutboundDeliveries.id,id));
   }
 };
 // Bounded parallelism gives school notices prompt delivery without
 // saturating email/SMS providers.
 for(let offset=0;offset<ids.length;offset+=6){
   await Promise.all(ids.slice(offset,offset+6).map(processOne));
 }
 return accepted;
}

import { and, asc, eq, gt, inArray, isNull, lte, notInArray, or } from "drizzle-orm";
import { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, people } from "@/db/schema";
import {
  noncreditEnrollmentWaitlist,noncreditSelfEnrollmentReleases,
  noncreditWaitlistEmailDeliveries,
} from "@/db/canonical-v301";
import { sendNotificationEmail } from "@/modules/communication/notification-email.server";
import { isDemoTenantOrganization } from "@/modules/identity/demo-school-tenants.server";

const LEASE_MS=120_000;
const MAX_ATTEMPTS=5;
const nextRetry=(attempt:number)=>Math.min(60_000*2**Math.max(0,attempt-1),3_600_000);
const nowAfter=(start:Date)=>new Date(start.getTime()+Math.max(0,Date.now()-start.getTime()));

/**
 * Retryable, leased delivery for invitations written atomically by the
 * provider command. Never send mail inside a DB transaction.
 *
 * We re-check the exact live invitation and the applicant's verified CAN
 * account/person relationship immediately before sending. External delivery
 * never enrolls a learner, accepts a seat or grants canonical identity.
 */
export async function processNoncreditWaitlistEmailDeliveries(
  now=new Date(),limit=30,
):Promise<{accepted:number;suppressed:number;failed:number}> {
  const processed:string[]=[];
  let accepted=0,suppressed=0,failed=0;
  const clock=()=>nowAfter(now);
  while(processed.length<Math.min(Math.max(limit,0),100)){
    const claimAt=clock();
    let leaseUntil=new Date(claimAt.getTime()+LEASE_MS);
    const [claimed]=await db.transaction(async tx=>{
      const [row]=await tx.select({id:noncreditWaitlistEmailDeliveries.id})
        .from(noncreditWaitlistEmailDeliveries).where(and(
          ...(processed.length?[notInArray(noncreditWaitlistEmailDeliveries.id,processed)]:[]),
          or(
            and(eq(noncreditWaitlistEmailDeliveries.status,"pending"),
              or(isNull(noncreditWaitlistEmailDeliveries.nextAttemptAt),
                lte(noncreditWaitlistEmailDeliveries.nextAttemptAt,claimAt))),
            and(eq(noncreditWaitlistEmailDeliveries.status,"failed"),
              lte(noncreditWaitlistEmailDeliveries.nextAttemptAt,claimAt)),
            and(eq(noncreditWaitlistEmailDeliveries.status,"processing"),
              lte(noncreditWaitlistEmailDeliveries.leaseUntil,claimAt)),
          ),
        )).orderBy(asc(noncreditWaitlistEmailDeliveries.createdAt))
        .limit(1).for("update",{skipLocked:true});
      if(!row)return [] as {id:string}[];
      await tx.update(noncreditWaitlistEmailDeliveries).set({
        status:"processing",leaseUntil,updatedAt:claimAt,
      }).where(eq(noncreditWaitlistEmailDeliveries.id,row.id));
      return [row];
    });
    if(!claimed)break;
    processed.push(claimed.id);
    const owned=()=>and(
      eq(noncreditWaitlistEmailDeliveries.id,claimed.id),
      eq(noncreditWaitlistEmailDeliveries.status,"processing"),
      eq(noncreditWaitlistEmailDeliveries.leaseUntil,leaseUntil),
    );
    const suppress=async(reason:string)=>{
      const rows=await db.update(noncreditWaitlistEmailDeliveries).set({
        status:"suppressed",lastError:reason,leaseUntil:null,nextAttemptAt:null,
        updatedAt:clock(),
      }).where(owned()).returning({id:noncreditWaitlistEmailDeliveries.id});
      if(rows.length)suppressed++;
    };
    try{
      const [record]=await db.select({
        delivery:noncreditWaitlistEmailDeliveries,
        accountId:noncreditEnrollmentWaitlist.accessAccountId,
        personId:noncreditEnrollmentWaitlist.accessPersonId,
        waitlistStatus:noncreditEnrollmentWaitlist.status,
        actualExpiry:noncreditEnrollmentWaitlist.inviteExpiresAt,
        releaseStatus:noncreditSelfEnrollmentReleases.status,
        releaseClosesAt:noncreditSelfEnrollmentReleases.closesAt,
        organizationId:noncreditSelfEnrollmentReleases.registeringOrganizationId,
      }).from(noncreditWaitlistEmailDeliveries)
        .innerJoin(noncreditEnrollmentWaitlist,eq(
          noncreditEnrollmentWaitlist.id,noncreditWaitlistEmailDeliveries.waitlistId,
        ))
        .innerJoin(noncreditSelfEnrollmentReleases,eq(
          noncreditSelfEnrollmentReleases.id,noncreditEnrollmentWaitlist.releaseId,
        ))
        .where(owned()).limit(1);
      if(!record)continue;
      if(record.waitlistStatus!=="invited" || !record.actualExpiry ||
         record.actualExpiry.getTime()!==record.delivery.invitationExpiresAt.getTime() ||
         record.actualExpiry<=clock() || record.releaseClosesAt<=clock() ||
         record.releaseStatus!=="published"){
        await suppress("invitation_no_longer_active");continue;
      }
      if(await isDemoTenantOrganization(record.organizationId)){
        await suppress("demo_tenant_external_delivery");continue;
      }
      const [recipient]=await db.select({
        email:accessAccounts.emailNormalized,
      }).from(accessAccounts)
        .innerJoin(accountPersonGrants,and(
          eq(accountPersonGrants.accountId,accessAccounts.id),
          eq(accountPersonGrants.personId,record.personId),
          eq(accountPersonGrants.active,true),
        ))
        .innerJoin(people,and(
          eq(people.id,accountPersonGrants.personId),
          eq(people.active,true),
        ))
        .where(and(
          eq(accessAccounts.id,record.accountId),
          eq(accessAccounts.disabled,false),
          gt(accessAccounts.emailVerifiedAt,new Date(0)),
        )).limit(1);
      if(!recipient?.email){
        await suppress("verified_account_person_unavailable");continue;
      }
      const sendAt=clock(),renewedUntil=new Date(sendAt.getTime()+LEASE_MS);
      const renewed=await db.update(noncreditWaitlistEmailDeliveries).set({
        leaseUntil:renewedUntil,updatedAt:sendAt,
      }).where(and(owned(),gt(noncreditWaitlistEmailDeliveries.leaseUntil,sendAt)))
        .returning({id:noncreditWaitlistEmailDeliveries.id});
      if(!renewed.length)continue;
      leaseUntil=renewedUntil;
      // No learner names, Person UUIDs, tokens, raw enrollment details or
      // links with arbitrary hosts are included in outbound mail.
      const origin=process.env.CAN_ACCESS_PUBLIC_ORIGIN;
      let actionUrl: string | undefined;
      try{
        if(origin && new URL(origin).protocol==="https:")
          actionUrl=new URL("/learn/my-courses",origin).toString();
      }catch{ /* The email remains useful without a URL. */ }
      const sent=await sendNotificationEmail({
        to:recipient.email,
        subject:"CAN learning: a place is available",
        text:"A place is available in a CAN learning program you joined the waitlist for. "+
          "Sign in to your own CAN account to review and accept the invitation before "+
          record.actualExpiry.toISOString()+". An invitation is not an enrollment.",
        ...(actionUrl?{actionUrl}:{}),
      },claimed.id);
      const attempt=record.delivery.attempts+1;
      const updated=await db.update(noncreditWaitlistEmailDeliveries).set({
        status:sent?"accepted":"failed",attempts:attempt,
        acceptedAt:sent?clock():null,
        lastError:sent?null:"provider_not_accepted",
        nextAttemptAt:sent||attempt>=MAX_ATTEMPTS?null:
          new Date(clock().getTime()+nextRetry(attempt)),
        leaseUntil:null,updatedAt:clock(),
      }).where(owned()).returning({id:noncreditWaitlistEmailDeliveries.id});
      if(updated.length){if(sent)accepted++;else failed++;}
    }catch{
      const [current]=await db.select({attempts:noncreditWaitlistEmailDeliveries.attempts})
        .from(noncreditWaitlistEmailDeliveries).where(owned()).limit(1);
      if(!current)continue;
      const attempts=current.attempts+1;
      const rows=await db.update(noncreditWaitlistEmailDeliveries).set({
        status:"failed",attempts,lastError:"delivery_worker_error",
        nextAttemptAt:attempts>=MAX_ATTEMPTS?null:
          new Date(clock().getTime()+nextRetry(attempts)),
        leaseUntil:null,updatedAt:clock(),
      }).where(owned()).returning({id:noncreditWaitlistEmailDeliveries.id});
      if(rows.length)failed++;
    }
  }
  return {accepted,suppressed,failed};
}

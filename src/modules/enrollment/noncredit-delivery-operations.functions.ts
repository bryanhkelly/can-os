import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents, noncreditEnrollmentWaitlist, noncreditWaitlistEmailDeliveries,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { waitlistDeliveryView } from "@/domain/notification-delivery-state";

const uuid = z.string().uuid();
const pageInput = z.object({releaseId:uuid,cursor:uuid.optional()}).strict();
const retryInput = z.object({
  releaseId:uuid,deliveryId:uuid,
  reason:z.string().trim().min(15).max(500),
}).strict();

function privateResponse() {
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}
const PAGE_SIZE=40;

/** Source-owned email outbox receipts only. No recipient email, tokens or
 * message text is returned; this is not a second notification ledger.
 * The provider and exact Site are resolved afresh from canonical authority.
 */
export const getNoncreditDeliveryAttempts=createServerFn({method:"GET"})
 .validator((value:unknown)=>pageInput.parse(value))
 .handler(async({data})=>{
  privateResponse();
  const {scopedRelease}=await import("./noncredit-cohort-operations.server");
  return db.transaction(async tx=>{
    const {release}=await scopedRelease(tx,data.releaseId);
    let cursor;
    if(data.cursor){
      const [anchor]=await tx.select({
        id:noncreditWaitlistEmailDeliveries.id,
        createdAt:noncreditWaitlistEmailDeliveries.createdAt,
      }).from(noncreditWaitlistEmailDeliveries)
        .innerJoin(noncreditEnrollmentWaitlist,eq(
          noncreditEnrollmentWaitlist.id,noncreditWaitlistEmailDeliveries.waitlistId))
        .where(and(eq(noncreditEnrollmentWaitlist.releaseId,release.id),
          eq(noncreditWaitlistEmailDeliveries.id,data.cursor))).limit(1);
      if(!anchor)throw new AuthorizationError("authorized delivery history cursor");
      cursor=or(
        lt(noncreditWaitlistEmailDeliveries.createdAt,anchor.createdAt),
        and(eq(noncreditWaitlistEmailDeliveries.createdAt,anchor.createdAt),
          lt(noncreditWaitlistEmailDeliveries.id,anchor.id)),
      );
    }
    const rows=await tx.select({
      delivery:noncreditWaitlistEmailDeliveries,
      invitationStatus:noncreditEnrollmentWaitlist.status,
      inviteExpiresAt:noncreditEnrollmentWaitlist.inviteExpiresAt,
    }).from(noncreditWaitlistEmailDeliveries)
      .innerJoin(noncreditEnrollmentWaitlist,eq(
        noncreditEnrollmentWaitlist.id,noncreditWaitlistEmailDeliveries.waitlistId))
      .where(and(eq(noncreditEnrollmentWaitlist.releaseId,release.id),cursor))
      .orderBy(desc(noncreditWaitlistEmailDeliveries.createdAt),
        desc(noncreditWaitlistEmailDeliveries.id))
      .limit(PAGE_SIZE+1);
    const page=rows.slice(0,PAGE_SIZE);
    const now=new Date();
    return {
      releaseId:release.id,
      items:page.map(({delivery,invitationStatus,inviteExpiresAt})=>{
        const state=waitlistDeliveryView({
          status:delivery.status,invitationStatus,
          invitationExpiresAt:delivery.invitationExpiresAt,
          currentInvitationExpiresAt:inviteExpiresAt,
          acceptedAt:delivery.acceptedAt,
          nextAttemptAt:delivery.nextAttemptAt,
          attempts:delivery.attempts,
        },now);
        return {
          id:delivery.id,createdAt:delivery.createdAt.toISOString(),
          acceptedAt:delivery.acceptedAt?.toISOString()??null,
          nextAttemptAt:delivery.nextAttemptAt?.toISOString()??null,
          attempts:delivery.attempts,
          ...state,
        };
      }),
      nextCursor:rows.length>PAGE_SIZE?page[page.length-1]!.delivery.id:null,
    };
  });
 });

/** Explicit operator recovery only; never resends accepted or expired mail.
 * This requeues the ORIGINAL receipt/idempotency key and leaves dispatch to
 * the worker, which independently rechecks all invitation/account eligibility.
 * A successful retry command means QUEUED, never sent or delivered.
 */
export const retryNoncreditDelivery=createServerFn({method:"POST"})
 .validator((value:unknown)=>retryInput.parse(value))
 .handler(async({data})=>{
  privateResponse();
  const {scopedRelease}=await import("./noncredit-cohort-operations.server");
  return db.transaction(async tx=>{
    const {provider,release}=await scopedRelease(tx,data.releaseId,true);
    const now=new Date();
    const [current]=await tx.select({
      receipt:noncreditWaitlistEmailDeliveries,
      invitationStatus:noncreditEnrollmentWaitlist.status,
      invitationExpiresAt:noncreditEnrollmentWaitlist.inviteExpiresAt,
    }).from(noncreditWaitlistEmailDeliveries)
      .innerJoin(noncreditEnrollmentWaitlist,eq(
        noncreditEnrollmentWaitlist.id,noncreditWaitlistEmailDeliveries.waitlistId))
      .where(and(eq(noncreditEnrollmentWaitlist.releaseId,release.id),
        eq(noncreditWaitlistEmailDeliveries.id,data.deliveryId)))
      .limit(1);
    if(!current)throw new AuthorizationError("own waitlist delivery");
    const state=waitlistDeliveryView({
      status:current.receipt.status,
      invitationStatus:current.invitationStatus,
      invitationExpiresAt:current.receipt.invitationExpiresAt,
      currentInvitationExpiresAt:current.invitationExpiresAt,
      acceptedAt:current.receipt.acceptedAt,
      nextAttemptAt:current.receipt.nextAttemptAt,
      attempts:current.receipt.attempts,
    },now);
    if(!state.retryable)throw new AuthorizationError("active failed invitation eligible for retry");
    const [updated]=await tx.update(noncreditWaitlistEmailDeliveries).set({
      status:"pending",nextAttemptAt:now,leaseUntil:null,
      // New operator-approved budget, same immutable provider idempotency key.
      attempts:0,lastError:null,updatedAt:now,
    }).where(and(
      eq(noncreditWaitlistEmailDeliveries.id,current.receipt.id),
      eq(noncreditWaitlistEmailDeliveries.status,"failed"),
      isNull(noncreditWaitlistEmailDeliveries.acceptedAt),
    )).returning({id:noncreditWaitlistEmailDeliveries.id});
    if(!updated)throw new AuthorizationError("delivery already recovered or changed");
    await tx.insert(auditEvents).values({
      actorPersonId:provider.actor.actorPersonId!,
      owningOrganizationId:provider.organizationId,
      eventCode:"noncredit.waitlist.email_retry_queued",
      entityKind:"noncredit_waitlist_email_delivery",
      entityId:updated.id,
      payload:{releaseId:release.id,reason:data.reason},
    });
    return {status:"queued" as const,deliveryId:updated.id,
      note:"Retry queued; the worker must still verify eligibility and provider acceptance."};
  });
 });

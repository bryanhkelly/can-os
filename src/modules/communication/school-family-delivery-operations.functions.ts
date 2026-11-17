import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { SMS_PROVIDER_OUTCOME_UNCONFIRMED, canRecoverTerminalDelivery } from "@/domain/outbound-sms-safety";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { writeAudit } from "@/platform/mutation";

const uuid=z.string().uuid();
const queryInput=z.object({cursor:uuid.optional()}).strict();
const retryInput=z.object({
  deliveryId:uuid,
  reason:z.string().trim().min(15).max(500),
}).strict();
const PAGE_SIZE=40;
function privateResponse(){
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}
async function operator(){
  const actor=await getCommandContext(getRequest());
  if(!actor.actorPersonId || actor.sessionAccountId ||
    !hasRegistrarAuthority(actor.role) ||
    !actor.scope.organizationIds?.length ||
    !actor.scope.siteIds?.length ||
    !actor.scope.programIds?.length)
    throw new AuthorizationError("authorized school family delivery operator");
  assertCapability(actor,"communication.send");
  return actor;
}
function receiptScope(actor:Awaited<ReturnType<typeof operator>>){
  return and(
    eq(s.notifications.type,"school_family_alert"),
    eq(s.notifications.resourceType,"action"),
    eq(s.actions.type,"school_family_bulletin"),
    inArray(s.actions.organizationId,actor.scope.organizationIds!),
    inArray(s.actions.siteId,actor.scope.siteIds!),
    inArray(s.actions.programId,actor.scope.programIds!),
  );
}

/**
 * Only receipt metadata, not PII, message body, phone/email or provider
 * response. A school Site favorite never grants cross-provider access.
 */
export const getSchoolFamilyDeliveryAttempts=createServerFn({method:"GET"})
  .validator((input:unknown)=>queryInput.parse(input))
  .handler(async({data})=>{
    privateResponse();
    const actor=await operator();
    return db.transaction(async tx=>{
      let before;
      if(data.cursor){
        const [anchor]=await tx.select({
          id:s.notificationOutboundDeliveries.id,
          createdAt:s.notificationOutboundDeliveries.createdAt,
        }).from(s.notificationOutboundDeliveries)
          .innerJoin(s.notifications,eq(s.notifications.id,s.notificationOutboundDeliveries.notificationId))
          .innerJoin(s.actions,eq(s.actions.id,s.notifications.resourceId))
          .where(and(receiptScope(actor),eq(s.notificationOutboundDeliveries.id,data.cursor)))
          .limit(1);
        if(!anchor)throw new AuthorizationError("scoped delivery history cursor");
        before=or(
          lt(s.notificationOutboundDeliveries.createdAt,anchor.createdAt),
          and(eq(s.notificationOutboundDeliveries.createdAt,anchor.createdAt),
            lt(s.notificationOutboundDeliveries.id,anchor.id)),
        );
      }
      const rows=await tx.select({
        receipt:s.notificationOutboundDeliveries,
      }).from(s.notificationOutboundDeliveries)
        .innerJoin(s.notifications,eq(s.notifications.id,s.notificationOutboundDeliveries.notificationId))
        .innerJoin(s.actions,eq(s.actions.id,s.notifications.resourceId))
        .where(and(receiptScope(actor),before))
        .orderBy(desc(s.notificationOutboundDeliveries.createdAt),
          desc(s.notificationOutboundDeliveries.id))
        .limit(PAGE_SIZE+1);
      const page=rows.slice(0,PAGE_SIZE);
      return {
        items:page.map(({receipt:r})=>({
          id:r.id,channel:r.channel,status:r.status,
          attempts:r.attempts,
          state:r.status==="accepted"?"provider_accepted":
            r.lastError==="sms_provider_outcome_unconfirmed"?"requires_provider_reconciliation":
            r.status==="failed"&&r.nextAttemptAt?"retry_scheduled":r.status,
          canRetry:canRecoverTerminalDelivery(r),
          createdAt:r.createdAt.toISOString(),
          acceptedAt:r.acceptedAt?.toISOString()??null,
          nextAttemptAt:r.nextAttemptAt?.toISOString()??null,
        })),
        nextCursor:rows.length>PAGE_SIZE?page[page.length-1]!.receipt.id:null,
      };
    });
  });

/**
 * Reopen only an already failed terminal receipt after an audited operator
 * decision. Never re-send provider-accepted, processing, scheduled-retry,
 * or suppressed records. The worker still rechecks guardian eligibility.
 */
export const retrySchoolFamilyDelivery=createServerFn({method:"POST"})
  .validator((input:unknown)=>retryInput.parse(input))
  .handler(async({data})=>{
    privateResponse();
    const actor=await operator();
    return db.transaction(async tx=>{
      const [current]=await tx.select({
        receipt:s.notificationOutboundDeliveries,
      }).from(s.notificationOutboundDeliveries)
        .innerJoin(s.notifications,eq(s.notifications.id,s.notificationOutboundDeliveries.notificationId))
        .innerJoin(s.actions,eq(s.actions.id,s.notifications.resourceId))
        .where(and(receiptScope(actor),
          eq(s.notificationOutboundDeliveries.id,data.deliveryId)))
        .limit(1).for("update");
      if(!current)throw new AuthorizationError("scoped failed receipt");
      const r=current.receipt;
      if(!canRecoverTerminalDelivery(r))
        throw new AuthorizationError("terminal failed receipt eligible for recovery");
      const now=new Date();
      const [updated]=await tx.update(s.notificationOutboundDeliveries).set({
        status:"pending",attempts:0,nextAttemptAt:now,
        leaseUntil:null,lastError:null,updatedAt:now,
      }).where(and(
        eq(s.notificationOutboundDeliveries.id,r.id),
        eq(s.notificationOutboundDeliveries.status,"failed"),
        isNull(s.notificationOutboundDeliveries.nextAttemptAt),
        isNull(s.notificationOutboundDeliveries.acceptedAt),
        isNull(s.notificationOutboundDeliveries.leaseUntil),
        sql`${s.notificationOutboundDeliveries.lastError} IS DISTINCT FROM ${SMS_PROVIDER_OUTCOME_UNCONFIRMED}`,
      )).returning({id:s.notificationOutboundDeliveries.id});
      if(!updated)throw new AuthorizationError("delivery was already recovered");
      await writeAudit(tx,actor,{
        action:"school.family_alert.delivery_retry_queued",
        entityType:"notification_outbound_delivery",entityId:r.id,
        scope:{
          organizationIds:actor.scope.organizationIds,
          siteIds:actor.scope.siteIds,
          programIds:actor.scope.programIds,
        },
        after:{reason:data.reason,channel:r.channel},
      });
      return {
        status:"queued" as const,deliveryId:r.id,
        note:"Retry queued. Eligibility and provider acceptance must still be verified by the worker.",
      };
    });
  });

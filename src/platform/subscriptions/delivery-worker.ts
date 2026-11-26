import { and, eq, gt, ne, notInArray, isNull, isNotNull, lte, or, asc } from "drizzle-orm";
import { db } from "@/db/client";
import { OUTBOUND_LEASE_MS, OUTBOUND_MAX_ATTEMPTS, outboundRetryDelayMs } from "@/domain/outbound-retry-policy";
import { SMS_PROVIDER_OUTCOME_UNCONFIRMED, outboundAttemptOutcome } from "@/domain/outbound-sms-safety";
import { domainEvents, subscriptionDeliveries, subscriptions, conversationMessages } from "@/db/schema";
import { emailNotificationRecipients, sendNotificationEmail } from "@/modules/communication/notification-email.server";
import { getSubscriptionPolicy } from "./policy";
import { getNotificationPreferences, nextAllowedDelivery, sendOptedInSms } from "./preferences";

const LEASE_MS=OUTBOUND_LEASE_MS;
const MAX_ATTEMPTS=OUTBOUND_MAX_ATTEMPTS;
const RETRY_MS=outboundRetryDelayMs;

/**
 * Claim one item just before processing. SKIP LOCKED serializes claims; the
 * lease timestamp fences stale writes and permits crash recovery.
 * The provider request is outside any database transaction.
 *
 * Like all HTTP providers, a timeout after provider acceptance is ambiguous.
 * A stable Idempotency-Key is sent to Resend to protect against duplicate sends.
 */
export async function processQueuedSubscriptionDeliveries(now = new Date(), limit = 50): Promise<number> {
  const startedAt = Date.now();
  const clock = () => new Date(now.getTime() + Math.max(0, Date.now() - startedAt));
  const processed: string[] = [];
  let accepted = 0;
  // Twilio currently has no idempotent receipt in this transport. A crashed
  // worker may have sent its SMS before losing the processing lease. Do not
  // send it again, and retire SMS failures queued by older worker versions.
  const recoveryTime=clock();
  await db.update(subscriptionDeliveries).set({
    status:"failed", nextAttemptAt:null, leaseUntil:null,
    lastError:SMS_PROVIDER_OUTCOME_UNCONFIRMED, updatedAt:recoveryTime,
  }).where(and(
    eq(subscriptionDeliveries.channel,"sms"),
    or(
      and(eq(subscriptionDeliveries.status,"processing"),
        lte(subscriptionDeliveries.leaseUntil,recoveryTime)),
      and(eq(subscriptionDeliveries.status,"failed"),
        isNotNull(subscriptionDeliveries.nextAttemptAt)),
    ),
  ));
  while (processed.length < limit) {
    const claimTime = clock();
    let leaseUntil = new Date(claimTime.getTime() + LEASE_MS);
    const id = await db.transaction(async tx => {
      const rows = await tx.select({ id: subscriptionDeliveries.id })
        .from(subscriptionDeliveries)
        .where(and(
          ...(processed.length ? [notInArray(subscriptionDeliveries.id, processed)] : []),
          or(
            and(eq(subscriptionDeliveries.status, "pending"),
              or(isNull(subscriptionDeliveries.nextAttemptAt), lte(subscriptionDeliveries.nextAttemptAt, claimTime))),
            and(eq(subscriptionDeliveries.status, "failed"),
              ne(subscriptionDeliveries.channel,"sms"),
              lte(subscriptionDeliveries.nextAttemptAt, claimTime)),
            and(eq(subscriptionDeliveries.status, "processing"),
              ne(subscriptionDeliveries.channel,"sms"),
              lte(subscriptionDeliveries.leaseUntil, claimTime)),
          ),
        ))
        .orderBy(asc(subscriptionDeliveries.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      const row = rows[0];
      if (row) {
        await tx.update(subscriptionDeliveries).set({
          status: "processing", leaseUntil, updatedAt: claimTime,
        }).where(eq(subscriptionDeliveries.id, row.id));
      }
      return row?.id;
    });
    if (!id) break;
    processed.push(id);
    const owned = () => and(eq(subscriptionDeliveries.id, id),
      eq(subscriptionDeliveries.status, "processing"), eq(subscriptionDeliveries.leaseUntil, leaseUntil));
    try {
      const delivery = await db.transaction(async tx => {
        const [row] = await tx.select().from(subscriptionDeliveries)
          .where(owned()).limit(1).for("update");
        if (!row || row.status !== "processing" || row.leaseUntil?.getTime() !== leaseUntil.getTime()) return null;
        const [subscription] = await tx.select().from(subscriptions)
          .where(eq(subscriptions.id, row.subscriptionId)).limit(1);
        const [event] = await tx.select().from(domainEvents)
          .where(eq(domainEvents.id, row.domainEventId)).limit(1);
        if (!subscription || !event || subscription.status !== "active" ||
          (subscription.expiresAt && subscription.expiresAt <= clock())) {
          await tx.update(subscriptionDeliveries).set({ status: "suppressed", lastError: "watch_inactive", leaseUntil: null })
            .where(owned());
          return null;
        }
        const policy = getSubscriptionPolicy(event.eventType);
        const context = policy ? await policy.load(tx, event) : null;
        const allowed = policy && context ? await policy.authorize(tx, context, subscription.subscriberPersonId) : false;
        const holds = allowed && context && policy ? await policy.conditionHolds(tx, context) : false;
        if (!allowed || !holds) {
          await tx.update(subscriptionDeliveries).set({
            status: "suppressed", lastError: allowed ? "condition_resolved" : "authorization_failed",
            leaseUntil: null, updatedAt: now,
          }).where(owned());
          return null;
        }
        const organizationId=policy!.organizationId(context!);
        if(row.channel!=="in_app"&&!organizationId){
          await tx.update(subscriptionDeliveries).set({
            status:"suppressed",lastError:"external_delivery_tenant_blocked",leaseUntil:null,updatedAt:now,
          }).where(owned());
          return null;
        }
        return {
          channel: row.channel, attempt: row.attempts + 1,
          personId: subscription.subscriberPersonId,
          organizationId,
          siteId: policy!.siteId?.(context!) ?? null,
          sourceConversationId: subscription.sourceConversationId,
          content: policy!.content(context!, row.kind === "initial" ? "initial" : "reminder"),
        };
      });
      if (!delivery) continue;
      const prefs = await getNotificationPreferences(delivery.personId);
      const quietUntil = prefs ? nextAllowedDelivery(clock(), prefs.timezone, prefs.quietStart, prefs.quietEnd) : null;
      if (quietUntil) {
        await db.update(subscriptionDeliveries).set({
          status: "pending", leaseUntil: null, nextAttemptAt: quietUntil, updatedAt: now,
        }).where(owned());
        continue;
      }
      const renewLease = async () => {
        const sendTime = clock();
        const renewedUntil = new Date(sendTime.getTime() + LEASE_MS);
        const rows = await db.update(subscriptionDeliveries).set({
          leaseUntil: renewedUntil, updatedAt: sendTime,
        }).where(and(owned(), gt(subscriptionDeliveries.leaseUntil, sendTime)))
          .returning({ id: subscriptionDeliveries.id });
        if (!rows.length) return false;
        leaseUntil = renewedUntil;
        return true;
      };
      let ok = false;
      let error = "channel_not_supported";
      if (delivery.channel === "email") {
        const emails = await emailNotificationRecipients([delivery.personId],delivery.organizationId);
        const email = emails.get(delivery.personId);
        if (!email) error = "no_active_email";
        else {
          if (!await renewLease()) continue;
          ok = await sendNotificationEmail({
            to: email, subject: delivery.content.title,
            siteId: delivery.siteId ?? undefined,
            text: delivery.content.body ?? delivery.content.title,
          }, id);
          error = "email_provider_failed";
        }
      }
      if (delivery.channel === "sms") {
        if (!prefs?.smsOptedIn || !prefs.smsVerifiedAt || !prefs.smsVerifiedPhone) {
          error = "sms_consent_required";
        } else {
          if (!await renewLease()) continue;
          // SMS previews must remain low-sensitivity; the guardian opens CAN for detail.
          ok = await sendOptedInSms(prefs.smsVerifiedPhone, "CAN OS: An assignment reminder needs your attention. Sign in to CAN OS to review.", delivery.organizationId);
          error = "sms_provider_failed";
        }
      }
      const attempt = delivery.attempt;
      const finishedAt=clock();
      const outcome=error==="sms_consent_required"
        ? {lastError:error,nextAttemptAt:null}
        : outboundAttemptOutcome(delivery.channel,{
          kind:ok?"accepted":"failed",
          reason:ok?null:error,
          nextAttemptAt:ok || attempt>=MAX_ATTEMPTS || error==="channel_not_supported"
            ? null : new Date(finishedAt.getTime()+RETRY_MS(attempt)),
        });
      await db.transaction(async tx => {
        const rows = await tx.update(subscriptionDeliveries).set({
          status: ok ? "delivered" : "failed",
          attempts: attempt,
          deliveredAt: ok ? finishedAt : null,
          lastError: outcome.lastError,
          nextAttemptAt: outcome.nextAttemptAt,
          leaseUntil: null,
          updatedAt: finishedAt,
        }).where(owned())
          .returning({ id: subscriptionDeliveries.id });
        if (rows.length && ok && delivery.sourceConversationId) {
          await tx.insert(conversationMessages).values({
            conversationId: delivery.sourceConversationId,
            role: "agent",
            body: delivery.content.body ?? delivery.content.title,
            evidenceRefs: delivery.content.resourceType && delivery.content.resourceId
              ? [{ type: delivery.content.resourceType, id: delivery.content.resourceId, label: delivery.content.title }]
              : [],
          });
        }
        if (rows.length && ok) accepted++;
      });
    } catch (error) {
      const [row] = await db.select({
        attempts:subscriptionDeliveries.attempts,channel:subscriptionDeliveries.channel,
      }).from(subscriptionDeliveries).where(owned()).limit(1);
      if (!row) continue;
      const attempts = row.attempts + 1;
      const failedAt=clock();
      const outcome=outboundAttemptOutcome(row.channel,{
        kind:"failed",
        reason:error instanceof Error ? error.message.slice(0,500) : "delivery_failed",
        nextAttemptAt:attempts>=MAX_ATTEMPTS
          ? null : new Date(failedAt.getTime()+RETRY_MS(attempts)),
      });
      await db.update(subscriptionDeliveries).set({
        status:"failed", attempts, leaseUntil:null,
        nextAttemptAt:outcome.nextAttemptAt,lastError:outcome.lastError,
        updatedAt:failedAt,
      }).where(owned());
    }
  }
  return accepted;
}

import { and, eq, gt, notInArray, isNull, lte, or, asc } from "drizzle-orm";
import { db } from "@/db/client";
import { domainEvents, subscriptionDeliveries, subscriptions, conversationMessages } from "@/db/schema";
import { emailNotificationRecipients, sendNotificationEmail } from "@/modules/communication/notification-email.server";
import { getSubscriptionPolicy } from "./policy";
import { getNotificationPreferences, nextAllowedDelivery, sendOptedInSms } from "./preferences";
import { isDemoTenantOrganization } from "@/domain/local-demo-access";

const LEASE_MS = 120_000;
const MAX_ATTEMPTS = 5;
const RETRY_MS = (attempt: number) => Math.min(60_000 * 2 ** Math.max(0, attempt - 1), 3_600_000);

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
            and(eq(subscriptionDeliveries.status, "failed"), lte(subscriptionDeliveries.nextAttemptAt, claimTime)),
            and(eq(subscriptionDeliveries.status, "processing"), lte(subscriptionDeliveries.leaseUntil, claimTime)),
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
        if(row.channel!=="in_app"&&(!organizationId||isDemoTenantOrganization(organizationId))){
          await tx.update(subscriptionDeliveries).set({
            status:"suppressed",lastError:"external_delivery_tenant_blocked",leaseUntil:null,updatedAt:now,
          }).where(owned());
          return null;
        }
        return {
          channel: row.channel, attempt: row.attempts + 1,
          personId: subscription.subscriberPersonId,
          organizationId,
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
      await db.transaction(async tx => {
        const rows = await tx.update(subscriptionDeliveries).set({
          status: ok ? "delivered" : "failed",
          attempts: attempt,
          deliveredAt: ok ? new Date() : null,
          lastError: ok ? null : error,
          nextAttemptAt: ok || attempt >= MAX_ATTEMPTS || ["channel_not_supported", "sms_consent_required"].includes(error)
            ? null : new Date(Date.now() + RETRY_MS(attempt)),
          leaseUntil: null,
          updatedAt: new Date(),
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
      const [row] = await db.select({ attempts: subscriptionDeliveries.attempts }).from(subscriptionDeliveries)
        .where(owned()).limit(1);
      if (!row) continue;
      const attempts = row.attempts + 1;
      await db.update(subscriptionDeliveries).set({
        status: "failed", attempts, leaseUntil: null,
        nextAttemptAt: attempts >= MAX_ATTEMPTS ? null : new Date(Date.now() + RETRY_MS(attempts)),
        lastError: error instanceof Error ? error.message.slice(0, 500) : "delivery_failed",
      }).where(owned());
    }
  }
  return accepted;
}

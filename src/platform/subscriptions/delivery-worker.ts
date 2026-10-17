import { and, eq, inArray, isNull, lte, or, asc } from "drizzle-orm";
import { db } from "@/db/client";
import { domainEvents, subscriptionDeliveries, subscriptions } from "@/db/schema";
import { emailNotificationRecipients, sendNotificationEmail } from "@/modules/communication/notification-email.server";
import { getSubscriptionPolicy } from "./policy";
import { getNotificationPreferences, nextAllowedDelivery, sendOptedInSms } from "./preferences";

const LEASE_MS = 120_000;
const MAX_ATTEMPTS = 5;
const RETRY_MS = (attempt: number) => Math.min(60_000 * 2 ** Math.max(0, attempt - 1), 3_600_000);

/**
 * The scheduled job may overlap across instances. Row leasing plus SKIP LOCKED
 * prevents simultaneous claims, and stale leases are reclaimed after crashes.
 * The provider request is outside any database transaction.
 *
 * Like all HTTP providers, a timeout after provider acceptance is ambiguous.
 * A stable Idempotency-Key is sent to Resend to protect against duplicate sends.
 */
export async function processQueuedSubscriptionDeliveries(now = new Date(), limit = 50): Promise<number> {
  const claimed = await db.transaction(async tx => {
    const rows = await tx.select({ id: subscriptionDeliveries.id })
      .from(subscriptionDeliveries)
      .where(or(
        or(and(eq(subscriptionDeliveries.status, "pending"),
          or(isNull(subscriptionDeliveries.nextAttemptAt), lte(subscriptionDeliveries.nextAttemptAt, now))),
          and(eq(subscriptionDeliveries.status, "failed"), lte(subscriptionDeliveries.nextAttemptAt, now))),
        and(eq(subscriptionDeliveries.status, "processing"), lte(subscriptionDeliveries.leaseUntil, now))
      ))
      .orderBy(asc(subscriptionDeliveries.createdAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (rows.length) {
      await tx.update(subscriptionDeliveries).set({
        status: "processing",
        leaseUntil: new Date(now.getTime() + LEASE_MS),
        updatedAt: now,
      }).where(inArray(subscriptionDeliveries.id, rows.map(row => row.id)));
    }
    return rows.map(row => row.id);
  });

  let accepted = 0;
  for (const id of claimed) {
    try {
      const delivery = await db.transaction(async tx => {
        const [row] = await tx.select().from(subscriptionDeliveries)
          .where(eq(subscriptionDeliveries.id, id)).limit(1);
        if (!row || row.status !== "processing") return null;
        const [subscription] = await tx.select().from(subscriptions)
          .where(eq(subscriptions.id, row.subscriptionId)).limit(1);
        const [event] = await tx.select().from(domainEvents)
          .where(eq(domainEvents.id, row.domainEventId)).limit(1);
        if (!subscription || !event || subscription.status !== "active" ||
          (subscription.expiresAt && subscription.expiresAt <= now)) {
          await tx.update(subscriptionDeliveries).set({ status: "suppressed", lastError: "watch_inactive", leaseUntil: null })
            .where(eq(subscriptionDeliveries.id, id));
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
          }).where(eq(subscriptionDeliveries.id, id));
          return null;
        }
        return {
          channel: row.channel, attempt: row.attempts + 1,
          personId: subscription.subscriberPersonId,
          content: policy!.content(context!, row.kind === "initial" ? "initial" : "reminder"),
        };
      });
      if (!delivery) continue;
      const prefs = await getNotificationPreferences(delivery.personId);
      const quietUntil = prefs ? nextAllowedDelivery(now, prefs.timezone, prefs.quietStart, prefs.quietEnd) : null;
      if (quietUntil) {
        await db.update(subscriptionDeliveries).set({
          status: "pending", leaseUntil: null, nextAttemptAt: quietUntil, updatedAt: now,
        }).where(eq(subscriptionDeliveries.id, id));
        continue;
      }
      let ok = false;
      let error = "channel_not_supported";
      if (delivery.channel === "email") {
        const emails = await emailNotificationRecipients([delivery.personId]);
        const email = emails.get(delivery.personId);
        if (!email) error = "no_active_email";
        else {
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
          // SMS previews must remain low-sensitivity; the guardian opens CAN for detail.
          ok = await sendOptedInSms(prefs.smsVerifiedPhone, "CAN OS: An assignment reminder needs your attention. Sign in to CAN OS to review.");
          error = "sms_provider_failed";
        }
      }
      const attempt = delivery.attempt;
      await db.update(subscriptionDeliveries).set({
        status: ok ? "delivered" : "failed",
        attempts: attempt,
        deliveredAt: ok ? new Date() : null,
        lastError: ok ? null : error,
        nextAttemptAt: ok || attempt >= MAX_ATTEMPTS || ["channel_not_supported", "sms_consent_required"].includes(error)
          ? null : new Date(Date.now() + RETRY_MS(attempt)),
        leaseUntil: null,
        updatedAt: new Date(),
      }).where(and(eq(subscriptionDeliveries.id, id), eq(subscriptionDeliveries.status, "processing")));
      if (ok) accepted++;
    } catch (error) {
      const [row] = await db.select({ attempts: subscriptionDeliveries.attempts }).from(subscriptionDeliveries)
        .where(eq(subscriptionDeliveries.id, id)).limit(1);
      const attempts = (row?.attempts ?? 0) + 1;
      await db.update(subscriptionDeliveries).set({
        status: "failed", attempts, leaseUntil: null,
        nextAttemptAt: attempts >= MAX_ATTEMPTS ? null : new Date(Date.now() + RETRY_MS(attempts)),
        lastError: error instanceof Error ? error.message.slice(0, 500) : "delivery_failed",
      }).where(eq(subscriptionDeliveries.id, id));
    }
  }
  return accepted;
}

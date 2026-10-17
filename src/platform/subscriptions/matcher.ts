import {
  and,
  arrayContains,
  eq,
  gt,
  inArray,
  isNull,
  or,
} from "drizzle-orm";
import { db } from "@/db/client";
import {
  domainEvents,
  subscriptionDeliveries,
  subscriptions,
} from "@/db/schema";
import { notify } from "@/platform/mutation";
import {
  emailNotificationRecipients,
  sendNotificationEmail,
} from "@/modules/communication/notification-email.server";
import { getSubscriptionPolicy } from "./policy";

type PendingEmail = {
  deliveryId: string;
  recipientPersonId: string;
  subject: string;
  text: string;
};

/**
 * Match a processed domain event against active subscriptions and deliver to
 * subscribers. Called by the outbox worker after the event's domain handler
 * succeeds. Deliveries are idempotent on (subscription, event, kind): the
 * unique index plus onConflictDoNothing makes reprocessing safe.
 */
export async function processEventSubscriptions(eventId: string): Promise<number> {
  const [event] = await db
    .select()
    .from(domainEvents)
    .where(eq(domainEvents.id, eventId))
    .limit(1);
  if (!event) return 0;

  const policy = getSubscriptionPolicy(event.eventType);
  if (!policy) return 0;

  const emailsToSend: PendingEmail[] = [];
  let delivered = 0;

  await db.transaction(async (tx) => {
    const context = await policy.load(tx, event);
    if (!context) return;

    const subjects = policy.subjects(context);
    if (!subjects.length) return;

    const now = new Date();
    const matches = await tx
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.status, "active"),
          arrayContains(subscriptions.eventTypes, [event.eventType]),
          or(
            ...subjects.map((subject) =>
              and(
                eq(subscriptions.subjectType, subject.subjectType),
                eq(subscriptions.subjectId, subject.subjectId),
              ),
            ),
          ),
          or(isNull(subscriptions.expiresAt), gt(subscriptions.expiresAt, now)),
        ),
      );

    for (const subscription of matches) {
      const allowed = await policy.authorize(
        tx,
        context,
        subscription.subscriberPersonId,
      );

      if (!allowed) {
        // Delivery-time authorization failed (e.g. the guardian relationship
        // was revoked after subscribing). Record the suppression so the
        // decision is auditable; never deliver on a stale permission.
        await tx
          .insert(subscriptionDeliveries)
          .values({
            subscriptionId: subscription.id,
            domainEventId: event.id,
            kind: "initial",
            channel: subscription.channel,
            status: "suppressed",
            lastError: "authorization_failed",
          })
          .onConflictDoNothing();
        continue;
      }

      const [delivery] = await tx
        .insert(subscriptionDeliveries)
        .values({
          subscriptionId: subscription.id,
          domainEventId: event.id,
          kind: "initial",
          channel: subscription.channel,
          status: "pending",
        })
        .onConflictDoNothing()
        .returning({ id: subscriptionDeliveries.id });

      if (!delivery) continue; // already delivered by an earlier run

      const content = policy.content(context, "initial");

      if (subscription.channel === "in_app") {
        const notificationId = await notify(tx, {
          recipientPersonId: subscription.subscriberPersonId,
          type: "watch_alert",
          title: content.title,
          body: content.body ?? null,
          resourceType: content.resourceType ?? null,
          resourceId: content.resourceId ?? null,
          eventId: event.id,
        });
        await tx
          .update(subscriptionDeliveries)
          .set({
            status: "delivered",
            notificationId,
            deliveredAt: now,
            updatedAt: now,
          })
          .where(eq(subscriptionDeliveries.id, delivery.id));
        delivered += 1;
      } else if (subscription.channel === "email") {
        emailsToSend.push({
          deliveryId: delivery.id,
          recipientPersonId: subscription.subscriberPersonId,
          subject: content.title,
          text: content.body ?? content.title,
        });
      } else {
        // sms / agent_webhook routes are not built yet; fail explicitly
        // rather than leaving a permanently pending delivery.
        await tx
          .update(subscriptionDeliveries)
          .set({
            status: "failed",
            attempts: 1,
            lastError: "channel_not_supported",
            updatedAt: now,
          })
          .where(eq(subscriptionDeliveries.id, delivery.id));
      }
    }
  });

  if (emailsToSend.length > 0) {
    const emails = await emailNotificationRecipients(
      emailsToSend.map((mail) => mail.recipientPersonId),
    );
    const origin = process.env.CAN_ACCESS_PUBLIC_ORIGIN;
    const actionUrl = origin ? `${new URL(origin).origin}/guardian` : undefined;

    for (const mail of emailsToSend) {
      const to = emails.get(mail.recipientPersonId);
      const sent = to ? await sendNotificationEmail({
          to,
          subject: mail.subject,
          text: mail.text,
          actionUrl,
        }) : false;
      await db
        .update(subscriptionDeliveries)
        .set({
          status: sent ? "delivered" : "failed",
          attempts: 1,
          lastError: sent ? null : "no_active_email",
          deliveredAt: sent ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(subscriptionDeliveries.id, mail.deliveryId));
      if (sent) delivered += 1;
    }
  }

  return delivered;
}

/** Subscriptions a person can inspect and manage ("Things CAN Is Watching"). */
export async function listSubscriptionsForPerson(personId: string) {
  return db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.subscriberPersonId, personId));
}

export async function setSubscriptionStatus(
  subscriptionId: string,
  personId: string,
  status: "active" | "paused" | "revoked",
): Promise<boolean> {
  const rows = await db
    .update(subscriptions)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.subscriberPersonId, personId),
        inArray(subscriptions.status, ["active", "paused"]),
      ),
    )
    .returning({ id: subscriptions.id });
  return rows.length > 0;
}

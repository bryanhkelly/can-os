import {
  and,
  arrayContains,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  domainEvents,
  conversationMessages,
  subscriptionEventReceipts,
  subscriptionDeliveries,
  subscriptions,
} from "@/db/schema";
import { notify } from "@/platform/mutation";
import { getSubscriptionPolicy } from "./policy";

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
  const [priorReceipt] = await db.select({ eventId: subscriptionEventReceipts.eventId })
    .from(subscriptionEventReceipts).where(eq(subscriptionEventReceipts.eventId, eventId)).limit(1);
  if (priorReceipt) return 0;

  let delivered = 0;

  await db.transaction(async (tx) => {
    const context = await policy.load(tx, event);
    if (!context) {
      await tx.insert(subscriptionEventReceipts).values({ eventId }).onConflictDoNothing();
      return;
    }

    const subjects = policy.subjects(context);
    if (!subjects.length) {
      await tx.insert(subscriptionEventReceipts).values({ eventId }).onConflictDoNothing();
      return;
    }

    const now = new Date();
    const matches = await tx
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.status, "active"),
          lte(subscriptions.createdAt, event.occurredAt),
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
        if (subscription.sourceConversationId) {
          await tx.insert(conversationMessages).values({
            conversationId: subscription.sourceConversationId,
            role: "agent",
            body: content.body ?? content.title,
            evidenceRefs: content.resourceType && content.resourceId
              ? [{ type: content.resourceType, id: content.resourceId, label: content.title }]
              : [],
          });
        }
        delivered += 1;
      }
      // Other channels stay pending for the independently retryable worker.
    }
    await tx.insert(subscriptionEventReceipts).values({ eventId }).onConflictDoNothing();
  });

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
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: subscriptions.id, status: subscriptions.status })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.id, subscriptionId),
          eq(subscriptions.subscriberPersonId, personId),
          inArray(subscriptions.status, ["active", "paused"]),
        ),
      )
      .limit(1);
    if (!current) return false;

    await tx
      .update(subscriptions)
      .set({ status, updatedAt: new Date() })
      .where(eq(subscriptions.id, current.id));

    await tx.insert(auditEvents).values({
      actorPersonId: personId,
      action: "subscription.status_changed",
      resourceType: "subscription",
      resourceId: current.id,
      before: { status: current.status },
      after: { status },
    });
    return true;
  });
}

/**
 * Reconcile subscription matching separately from the primary academic handler.
 * A crash after the academic event is processed but before matching watches
 * must not drop an alert. Receipt writes happen in the same transaction as
 * the new subscription delivery queue records.
 */
export async function recoverSubscriptionEventMatches(limit = 100): Promise<number> {
  const candidates = await db.select({ id: domainEvents.id }).from(domainEvents)
    .where(and(
      eq(domainEvents.status, "processed"),
      eq(domainEvents.eventType, "AssignmentBecameMissing"),
      sql`NOT EXISTS (SELECT 1 FROM subscription_event_receipts r WHERE r.event_id = ${domainEvents.id})`,
    )).limit(limit);
  let recovered = 0;
  for (const event of candidates) {
    try {
      await processEventSubscriptions(event.id);
      recovered++;
    } catch (error) {
      console.error("subscription event recovery failed", event.id, error instanceof Error ? error.message : "unknown");
    }
  }
  return recovered;
}

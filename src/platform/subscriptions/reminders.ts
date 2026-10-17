import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { domainEvents, subscriptionDeliveries } from "@/db/schema";
import { notify } from "@/platform/mutation";
import { emailNotificationRecipients, sendNotificationEmail } from "@/modules/communication/notification-email.server";
import { getSubscriptionPolicy } from "./policy";

type ReminderCandidate = {
  delivery_id: string;
  subscription_id: string;
  domain_event_id: string;
  event_type: string;
  subscriber_person_id: string;
  channel: string;
};

/**
 * Process due subscription reminders. A reminder fires only while the watched
 * condition still holds against current canonical state (e.g. the submission
 * is still missing); if the condition resolved, the reminder is recorded as
 * suppressed rather than sent. At most one reminder per subscription+event.
 */
export async function processSubscriptionReminders(now = new Date()): Promise<number> {
  const result = await db.execute<ReminderCandidate>(sql`
    select
      d.id as delivery_id,
      d.subscription_id,
      d.domain_event_id,
      e.event_type,
      s.subscriber_person_id,
      s.channel
    from subscription_deliveries d
    join subscriptions s on s.id = d.subscription_id
    join domain_events e on e.id = d.domain_event_id
    where d.kind = 'initial'
      and d.status = 'delivered'
      and s.status = 'active'
      and (s.expires_at is null or s.expires_at > ${now})
      and (s.reminder_policy->>'remindAfterHours') is not null
      and e.occurred_at <= ${now}::timestamptz - ((s.reminder_policy->>'remindAfterHours')::int * interval '1 hour')
      and not exists (
        select 1 from subscription_deliveries r
        where r.subscription_id = d.subscription_id
          and r.domain_event_id = d.domain_event_id
          and r.kind = 'reminder'
      )
    order by d.created_at
    limit 100
  `);

  let sent = 0;
  const pendingEmails: Array<{ deliveryId: string; personId: string; title: string; body: string }> = [];

  for (const candidate of result.rows ?? []) {
    const policy = getSubscriptionPolicy(candidate.event_type);
    if (!policy) continue;

    await db.transaction(async (tx) => {
      const [event] = await tx
        .select()
      .from(domainEvents)
        .where(eq(domainEvents.id, candidate.domain_event_id))
        .limit(1);
      if (!event) return;

      const context = await policy.load(tx, event);
      if (!context) return;

      const stillAuthorized = await policy.authorize(
        tx,
        context,
        candidate.subscriber_person_id,
      );
      const conditionHolds = stillAuthorized
        ? await policy.conditionHolds(tx, context)
        : false;

      if (!conditionHolds) {
        await tx
          .insert(subscriptionDeliveries)
          .values({
            subscriptionId: candidate.subscription_id,
            domainEventId: candidate.domain_event_id,
            kind: "reminder",
            channel: candidate.channel as "in_app" | "email" | "sms" | "agent_webhook",
            status: "suppressed",
            lastError: stillAuthorized ? "condition_resolved" : "authorization_failed",
          })
          .onConflictDoNothing();
        return;
      }

      const content = policy.content(context, "reminder");
      const [reminder] = await tx
        .insert(subscriptionDeliveries)
        .values({
          subscriptionId: candidate.subscription_id,
          domainEventId: candidate.domain_event_id,
          kind: "reminder",
          channel: candidate.channel as "in_app" | "email" | "sms" | "agent_webhook",
          status: "pending",
        })
        .onConflictDoNothing()
        .returning({ id: subscriptionDeliveries.id });

      if (!reminder) return;

      if (candidate.channel === "email") {
        pendingEmails.push({
          deliveryId: reminder.id,
          personId: candidate.subscriber_person_id,
          title: content.title,
          body: content.body ?? content.title,
        });
        return;
      }
      if (candidate.channel !== "in_app") {
        await tx.update(subscriptionDeliveries).set({
          status: "failed", attempts: 1, lastError: "channel_not_supported", updatedAt: now,
        }).where(eq(subscriptionDeliveries.id, reminder.id));
        return;
      }

      const notificationId = await notify(tx, {
        recipientPersonId: candidate.subscriber_person_id,
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
        .where(eq(subscriptionDeliveries.id, reminder.id));
      sent += 1;
    });
  }

  // External delivery must happen outside the database transaction.
  if (pendingEmails.length) {
    const recipientEmails = await emailNotificationRecipients(pendingEmails.map((item) => item.personId));
    for (const item of pendingEmails) {
      const email = recipientEmails.get(item.personId);
      const accepted = email
        ? await sendNotificationEmail({ to: email, subject: item.title, text: item.body })
        : false;
      await db.update(subscriptionDeliveries).set({
        status: accepted ? "delivered" : "failed",
        attempts: 1,
        lastError: accepted ? null : email ? "email_provider_failed" : "no_active_email",
        deliveredAt: accepted ? new Date() : null,
        updatedAt: new Date(),
      }).where(eq(subscriptionDeliveries.id, item.deliveryId));
      if (accepted) sent += 1;
    }
  }
  return sent;
}

import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { domainEvents, subscriptionDeliveries } from "@/db/schema";
import { notify } from "@/platform/mutation";
import { getSubscriptionPolicy } from "./policy";

type ReminderCandidate = {
  delivery_id: string;
  subscription_id: string;
  domain_event_id: string;
  event_type: string;
  subscriber_person_id: string;
  channel: string;
  next_kind: string;
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
      s.channel,
      case when count(r.id) = 0 then 'reminder' else 'reminder:' || (count(r.id) + 1)::text end as next_kind
    from subscription_deliveries d
    join subscriptions s on s.id = d.subscription_id
    join domain_events e on e.id = d.domain_event_id
    left join subscription_deliveries r on r.subscription_id = d.subscription_id and r.domain_event_id = d.domain_event_id and r.kind like 'reminder%'
    where d.kind = 'initial'
      and d.status = 'delivered'
      and s.status = 'active'
      and (s.expires_at is null or s.expires_at > ${now})
      and (s.reminder_policy->>'remindAfterHours') is not null
      and e.occurred_at <= ${now}::timestamptz - ((s.reminder_policy->>'remindAfterHours')::int * interval '1 hour')
    group by d.id, d.subscription_id, d.domain_event_id, e.event_type, e.occurred_at, s.subscriber_person_id, s.channel, s.reminder_policy, d.created_at
    having count(r.id) < greatest(1, least(30, coalesce((s.reminder_policy->>'maxReminders')::int, 1)))
      and ${now}::timestamptz >= e.occurred_at +
        (coalesce((s.reminder_policy->>'remindAfterHours')::int, 24) +
          count(r.id)::int * greatest(1, coalesce((s.reminder_policy->>'repeatEveryHours')::int, 24))) * interval '1 hour'
    order by d.created_at
    limit 100
  `);

  let sent = 0;

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
            kind: candidate.next_kind,
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
          kind: candidate.next_kind,
          channel: candidate.channel as "in_app" | "email" | "sms" | "agent_webhook",
          status: "pending",
        })
        .onConflictDoNothing()
        .returning({ id: subscriptionDeliveries.id });

      if (!reminder) return;

      // Email and other channels are processed by the dedicated delivery worker.
      if (candidate.channel !== "in_app") return;

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

  return sent;
}

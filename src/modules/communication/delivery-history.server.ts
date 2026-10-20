import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { subscriptionDeliveries, subscriptions } from "@/db/schema";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";

const PAGE_SIZE = 25;

function deliveryOutcome(row: typeof subscriptionDeliveries.$inferSelect) {
  switch (row.status) {
    case "delivered":
      return row.channel === "in_app"
        ? { label: "Available in CAN", detail: "The in-app notification was created. This does not mean it has been read." }
        : { label: "Accepted by provider", detail: "The sending provider accepted the request. Inbox or handset delivery and reading are not verified." };
    case "pending":
      return { label: "Queued", detail: row.nextAttemptAt ? "Waiting for the next scheduled attempt or the end of quiet hours." : "Waiting for the delivery worker." };
    case "processing":
      return { label: "Processing", detail: "A delivery worker has claimed this update. The outcome is not yet recorded." };
    case "suppressed":
      return {
        label: "Not sent",
        detail: row.lastError === "authorization_failed"
          ? "Access to the watched record is no longer authorized."
          : row.lastError === "condition_resolved"
            ? "The watched condition no longer requires an update."
            : row.lastError === "watch_inactive"
              ? "The watch is inactive or expired."
              : "Delivery was suppressed by the current watch policy.",
      };
    case "failed":
      return {
        label: row.nextAttemptAt ? "Retry scheduled" : "Failed",
        detail: row.lastError === "no_active_email"
          ? "No active account email is available."
          : row.lastError === "sms_consent_required"
            ? "SMS requires a verified phone number and current opt-in."
            : row.lastError === "channel_not_supported"
              ? "This delivery channel is not supported."
              : "The delivery attempt failed. Provider details are not exposed here.",
      };
  }
}

/** Personal delivery metadata only; historical watches do not confer resource access. */
export async function listDeliveryHistory(context: CommandContext, cursor?: string) {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated delivery recipient");
  const owned = eq(subscriptions.subscriberPersonId, context.actorPersonId);
  let before;
  if (cursor) {
    const [anchor] = await db.select({
      id: subscriptionDeliveries.id,
      createdAt: sql<string>`${subscriptionDeliveries.createdAt}::text`,
    }).from(subscriptionDeliveries)
      .innerJoin(subscriptions, eq(subscriptions.id, subscriptionDeliveries.subscriptionId))
      .where(and(owned, eq(subscriptionDeliveries.id, cursor))).limit(1);
    if (!anchor) throw new Error("Delivery history page is unavailable for this account.");
    const timestamp = sql`${anchor.createdAt}::timestamptz`;
    before = or(
      lt(subscriptionDeliveries.createdAt, timestamp),
      and(eq(subscriptionDeliveries.createdAt, timestamp), lt(subscriptionDeliveries.id, anchor.id)),
    );
  }
  const rows = await db.select({ delivery: subscriptionDeliveries })
    .from(subscriptionDeliveries)
    .innerJoin(subscriptions, eq(subscriptions.id, subscriptionDeliveries.subscriptionId))
    .where(and(owned, before))
    .orderBy(desc(subscriptionDeliveries.createdAt), desc(subscriptionDeliveries.id))
    .limit(PAGE_SIZE + 1);
  const page = rows.slice(0, PAGE_SIZE);
  return {
    items: page.map(({ delivery: row }) => ({
      id: row.id,
      channel: row.channel,
      kind: row.kind === "initial" ? "Watch update" : "Reminder",
      status: row.status,
      ...deliveryOutcome(row),
      attempts: row.attempts,
      createdAt: row.createdAt.toISOString(),
      acceptedAt: row.deliveredAt?.toISOString() ?? null,
      nextAttemptAt: row.status === "pending" || row.status === "failed"
        ? row.nextAttemptAt?.toISOString() ?? null : null,
    })),
    nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1]!.delivery.id : null,
  };
}

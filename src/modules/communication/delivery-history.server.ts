import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { subscriptionDeliveries, subscriptions } from "@/db/schema";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import { deliveryOutcome } from "@/domain/delivery-outcome";

const PAGE_SIZE = 25;

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

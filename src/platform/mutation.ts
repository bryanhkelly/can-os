import { auditEvents, domainEvents, notifications } from "@/db/schema";
import type { CommandContext } from "@/domain/command-context";

/**
 * Minimal structural view of a Drizzle transaction's write surface. The db
 * client is never statically imported here so server-only code stays out of
 * client bundles; callers pass the `tx` handed to `db.transaction(...)`.
 */
export interface InsertChain extends PromiseLike<unknown> {
  returning(
    columns: Record<string, unknown>,
  ): PromiseLike<Array<Record<string, unknown>>>;
}

export interface MutationTx {
  insert(table: unknown): {
    values(
      values: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>,
    ): InsertChain;
  };
}

type ScopeIds = {
  organizationId?: string | null;
  siteId?: string | null;
  programId?: string | null;
  sectionId?: string | null;
};

/**
 * Append a domain event to the transactional outbox. `domain_events` has no
 * dedicated scope columns, so any provided scope ids are merged into the
 * payload (explicit payload keys win on conflict).
 */
export async function emitEvent(
  tx: MutationTx,
  event: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    actorPersonId?: string | null;
    payload?: Record<string, unknown>;
  } & ScopeIds,
): Promise<string> {
  const scope: Record<string, unknown> = {};
  if (event.organizationId != null) scope.organizationId = event.organizationId;
  if (event.siteId != null) scope.siteId = event.siteId;
  if (event.programId != null) scope.programId = event.programId;
  if (event.sectionId != null) scope.sectionId = event.sectionId;

  const rows = await tx
    .insert(domainEvents)
    .values({
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      actorPersonId: event.actorPersonId ?? null,
      payload: { ...scope, ...(event.payload ?? {}) },
    })
    .returning({ id: domainEvents.id });

  const id = rows[0]?.id;
  if (typeof id !== "string") throw new Error("Failed to emit domain event");
  return id;
}

/**
 * Append an audit row attributing the mutation to the verified actor and
 * request. Same shape as `recordAudit` in modules/identity/actors.server.ts:
 * actor in the column, request/session detail in the `context` jsonb.
 */
export async function writeAudit(
  tx: MutationTx,
  context: CommandContext,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    scope?: Record<string, unknown>;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    contextExtras?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(auditEvents).values({
    actorPersonId: context.actorPersonId,
    action: entry.action,
    resourceType: entry.entityType,
    resourceId: entry.entityId,
    scope: entry.scope ?? {},
    before: entry.before ?? null,
    after: entry.after ?? null,
    context: {
      requestId: context.requestId ?? null,
      ...(entry.contextExtras ?? {}),
    },
  });
}

export type NotificationInput = {
  recipientPersonId: string;
  type: string;
  title: string;
  body?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  eventId?: string | null;
};

/** Queue an in-app notification for a single recipient. */
export async function notify(
  tx: MutationTx,
  notification: NotificationInput,
): Promise<string> {
  const ids = await notifyMany(tx, [notification]);
  const id = ids[0];
  if (typeof id !== "string") throw new Error("Failed to create notification");
  return id;
}

/** Queue in-app notifications for many recipients in one insert. */
export async function notifyMany(
  tx: MutationTx,
  items: ReadonlyArray<NotificationInput>,
): Promise<string[]> {
  if (!items.length) return [];
  const rows = await tx
    .insert(notifications)
    .values(
      items.map((notification) => ({
        recipientPersonId: notification.recipientPersonId,
        type: notification.type,
        title: notification.title,
        body: notification.body ?? null,
        resourceType: notification.resourceType ?? null,
        resourceId: notification.resourceId ?? null,
        eventId: notification.eventId ?? null,
      })),
    )
    .returning({ id: notifications.id });
  return rows
    .map((row) => row.id)
    .filter((value): value is string => typeof value === "string");
}

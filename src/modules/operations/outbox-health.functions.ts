import { hasRegistrarAuthority } from "@/domain/school-roles";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { actions, notifications, notificationOutboundDeliveries } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";

/**
 * Outbox counts are operator-only telemetry. Authorization matches the
 * operations action-workspace pattern: an active registrar with school scope.
 * Read-only; the worker owns all outbox mutations.
 */
export const getOutboxHealthSummary = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await getCommandContext(getRequest());
  if (!actor.actorPersonId || !hasRegistrarAuthority(actor.role) || !actor.scope.siteIds?.length)
    throw new AuthorizationError("authorized school operator");
  setResponseHeader("Cache-Control", "private, no-store");
  const { getOutboxHealth } = await import("@/workers/domain-event-worker");
  const organizationIds=actor.scope.organizationIds??[];
  const counts=await getOutboxHealth(actor.scope.siteIds);
  if (!organizationIds.length) {
    return { ...counts, schoolFamilyDelivery: {
      pending:0, processing:0, retryScheduled:0, failed:0,
      providerAccepted:0, suppressed:0,
    }};
  }
  const d=notificationOutboundDeliveries;
  // Receipts remain in their source tables. These scoped metrics expose
  // no contact information, payload text or cross-Site delivery metadata.
  const [row]=await db.select({
    pending:sql<number>`count(*) filter (where ${d.status} = 'pending')::int`,
    processing:sql<number>`count(*) filter (where ${d.status} = 'processing')::int`,
    retryScheduled:sql<number>`count(*) filter (where ${d.status} = 'failed' and ${d.nextAttemptAt} is not null)::int`,
    failed:sql<number>`count(*) filter (where ${d.status} = 'failed' and ${d.nextAttemptAt} is null)::int`,
    providerAccepted:sql<number>`count(*) filter (where ${d.status} = 'accepted')::int`,
    suppressed:sql<number>`count(*) filter (where ${d.status} = 'suppressed')::int`,
  }).from(d)
    .innerJoin(notifications,eq(notifications.id,d.notificationId))
    .innerJoin(actions,eq(actions.id,notifications.resourceId))
    .where(and(
      eq(notifications.type,"school_family_alert"),
      eq(actions.type,"school_family_bulletin"),
      inArray(actions.siteId,actor.scope.siteIds),
      inArray(actions.organizationId,organizationIds),
    ));
  return { ...counts, schoolFamilyDelivery:{
    pending:Number(row?.pending??0),
    processing:Number(row?.processing??0),
    retryScheduled:Number(row?.retryScheduled??0),
    failed:Number(row?.failed??0),
    providerAccepted:Number(row?.providerAccepted??0),
    suppressed:Number(row?.suppressed??0),
  }};
});

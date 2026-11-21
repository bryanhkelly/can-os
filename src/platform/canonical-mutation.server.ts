import type { db } from "@/db/client";
import type { auditEvents as nativeAuditEvents, domainEvents as nativeDomainEvents } from "@/db/canonical-v301";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { getRequest } from "@tanstack/react-start/server";
import { accessSessionCookie } from "@/domain/access-tokens";
import { readCookie } from "@/domain/session-cookies";
import { AuthorizationError } from "@/domain/command-context";
import { getIdentityContext } from "@/modules/identity/command-context.server";

/**
 * Compatibility contract for native Class and noncredit callers.
 * This adapter routes its writes into the one authoritative public.audit_events and
 * public.domain_events journals through the shared platform writers.
 *
 * Native operation codes, organization attribution, payload, actor and
 * original event time are retained. No duplicate journal write, shadow table,
 * async side effect or independent transaction.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type CanonicalAuditInput = Omit<typeof nativeAuditEvents.$inferInsert, "id">;
type CanonicalDomainEventInput = Omit<
  typeof nativeDomainEvents.$inferInsert,
  "id" | "status" | "attempts" | "lastError" | "nextAttemptAt" | "processedAt" | "createdAt"
>;

/** Request-bound actor attribution is resolved only from the signed CAN
 * session; no caller, study plan or browser field can claim impersonation.
 * Noninteractive/native-only jobs retain their established audit shape. */
async function impersonationAuditContext(actorPersonId:string|null|undefined) {
  let request:Request;
  try { request=getRequest(); } catch { return {}; }
  if(!readCookie(request,accessSessionCookie))return {};
  const actor=await getIdentityContext(request);
  if(!actor.impersonatedByAccountId)return {};
  if(!actorPersonId || actor.actorPersonId!==actorPersonId)
    throw new AuthorizationError("current effective audit Person");
  return {
    effectiveAccountId: actor.accountId,
    sessionAccountId: actor.impersonatedByAccountId,
    sessionId: actor.sessionId,
    selectedGrantId: actor.grantId,
    delegatedByDemoAdmin: true,
  };
}

export async function writeCanonicalAudit(
  tx: Tx,
  entry: CanonicalAuditInput,
): Promise<void> {
  const delegation=await impersonationAuditContext(entry.actorPersonId);
  await writeAudit(tx, {
    actorPersonId: entry.actorPersonId ?? null,
    action: entry.eventCode,
    resourceType: entry.entityKind,
    resourceId: entry.entityId,
    scope: entry.owningOrganizationId
      ? { organizationId: entry.owningOrganizationId }
      : {},
    context: {
      source: "canonical_v301",
      nativeAuditPayload: entry.payload ?? {},
      ...delegation,
    },
    ...(entry.occurredAt ? { occurredAt: entry.occurredAt } : {}),
  });
}

/** Atomically enqueue native domain facts in the existing shared public outbox. */
export async function emitCanonicalDomainEvent(
  tx: Tx,
  entry: CanonicalDomainEventInput,
): Promise<void> {
  await emitEvent(tx, {
    eventType: entry.eventType,
    aggregateType: entry.aggregateType,
    aggregateId: entry.aggregateId,
    actorPersonId: entry.actorPersonId ?? null,
    payload: entry.payload ?? {},
    ...(entry.occurredAt ? { occurredAt: entry.occurredAt } : {}),
  });
}

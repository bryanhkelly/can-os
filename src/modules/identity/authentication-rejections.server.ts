import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { writeAudit } from "@/platform/mutation";

/**
 * An authentication rejection has no proven account or person identity.
 * Never link an unverified token/email to a person, and never store credential
 * material, submitted email, IP, headers, or request body in audit_events.
 */
export type AnonymousAuthMethod = "email_link" | "local_demo_code";
export const ANONYMOUS_AUTH_RESOURCE_ID = "00000000-0000-0000-0000-000000000000";
export const MAX_RECORDED_AUTH_REJECTIONS_PER_MINUTE = 30;

/**
 * Best-effort, bounded audit evidence, NOT a request-rate limiter.
 * A transaction-scoped nonblocking lock guards the read/write cap against
 * parallel submissions; rejected lock contenders are simply not recorded.
 * Caller must always return the same generic rejection regardless of result.
 */
export async function recordRejectedAuthentication(method: AnonymousAuthMethod): Promise<boolean> {
 try {
  return await db.transaction(async tx => {
   const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${"auth-rejection:" + method})) as acquired`);
   // The Neon-serverless driver returns QueryResult.rows. Fail closed for
   // telemetry (skip writing) if a different driver response is encountered.
   const lockRows = (lock as { rows?: Array<{ acquired?: boolean }> }).rows;
   if (lockRows?.[0]?.acquired !== true) return false;
   const now = new Date();
   const recent = await tx.select({ id: auditEvents.id }).from(auditEvents)
    .where(and(
     eq(auditEvents.resourceType, "authentication"),
     eq(auditEvents.resourceId, ANONYMOUS_AUTH_RESOURCE_ID),
     eq(auditEvents.action, "identity.verification.rejected"),
     sql`${auditEvents.context}->>'method' = ${method}`,
     gt(auditEvents.occurredAt, new Date(now.getTime() - 60_000)),
    ))
    .limit(MAX_RECORDED_AUTH_REJECTIONS_PER_MINUTE);
   if (recent.length >= MAX_RECORDED_AUTH_REJECTIONS_PER_MINUTE) return false;
   await writeAudit(tx, {
    actorPersonId: null,
    action: "identity.verification.rejected",
    resourceType: "authentication",
    resourceId: ANONYMOUS_AUTH_RESOURCE_ID,
    scope: {},
    context: { method, outcome: "rejected", attributable: false },
   });
   return true;
  });
 } catch {
  // Never return persistence or account information to unauthenticated users.
  // Audit storage failures must not change the credential-rejection response.
  console.warn("Anonymous authentication audit unavailable");
  return false;
 }
}

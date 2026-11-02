import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { accessSessions } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { sessionIdleCutoff } from "@/domain/access-tokens";
import { recordSessionSecurityEvent } from "./session-security-audit.server";

/**
 * Account-owned sessions, never school-owned sessions. No raw credential,
 * fingerprint, IP address or guessed device is included in the response.
 * updatedAt is provisionally the meaningful-activity timestamp; a distinct
 * activity timestamp and optional device metadata are a separate future bite.
 */
export async function listAccountSessions(actor: AccessContext) {
 if (!actor.accountId || !actor.sessionId || !actor.actorPersonId)
  throw new AuthorizationError("authenticated account session");
 const now = new Date();
 const rows = await db.select({
  id: accessSessions.id,
  createdAt: accessSessions.createdAt,
  lastActivityAt: accessSessions.updatedAt,
  expiresAt: accessSessions.expiresAt,
 }).from(accessSessions)
  .where(and(
   eq(accessSessions.accountId, actor.sessionAccountId ?? actor.accountId),
   isNull(accessSessions.revokedAt),
   gt(accessSessions.expiresAt, now),
   gt(accessSessions.updatedAt, sessionIdleCutoff(now)),
  ))
  .orderBy(desc(accessSessions.updatedAt))
  .limit(100);
 return rows.map(row => ({
  id: row.id,
  current: row.id === actor.sessionId,
  createdAt: row.createdAt.toISOString(),
  lastActivityAt: row.lastActivityAt.toISOString(),
  expiresAt: row.expiresAt.toISOString(),
 }));
}

/**
 * Revoke only sessions owned by the verified account. Idempotent for unknown,
 * already revoked, and other-account IDs: callers cannot enumerate them.
 * The caller's current session is cleared by the HTTP boundary if affected.
 */
export async function revokeOwnedAccountSessions(
 actor: AccessContext,
 selection: { kind: "one"; sessionId: string } | { kind: "all" },
) {
 if (!actor.accountId || !actor.sessionId || !actor.actorPersonId)
  throw new AuthorizationError("authenticated account session");
 return db.transaction(async tx => {
  const now = new Date();
  const criteria = [
   eq(accessSessions.accountId, actor.sessionAccountId ?? actor.accountId),
   isNull(accessSessions.revokedAt),
  ];
  if (selection.kind === "one") {
   criteria.push(eq(accessSessions.id, selection.sessionId));
  }
  const changed = await tx.update(accessSessions).set({
   revokedAt: now,
   updatedAt: now,
  }).where(and(...criteria)).returning({ id: accessSessions.id });
  if (changed.length) {
   await recordSessionSecurityEvent(tx, {
    action: selection.kind === "all"
     ? "identity.sessions.revoked_all" : "identity.session.revoked_remote",
    accountId: actor.accountId,
    sessionAccountId: actor.sessionAccountId ?? actor.accountId,
    actorPersonId: actor.actorPersonId!,
    sessionId: actor.sessionId,
    grantId: actor.grantId,
    role: actor.role,
    revokedCount: changed.length,
    ...(selection.kind === "one" ? { targetSessionId: selection.sessionId } : {}),
   });
  }
  return {
   revokedCount: changed.length,
   currentRevoked: changed.some(row => row.id === actor.sessionId),
  };
 });
}

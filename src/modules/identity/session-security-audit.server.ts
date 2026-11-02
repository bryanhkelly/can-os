import type { MutationTx } from "@/platform/mutation";
import { writeAudit } from "@/platform/mutation";

/**
 * Security lifecycle events are kept in the existing append-only audit store.
 * They do not belong in student learning telemetry or in the product analytics
 * event stream. Only server-resolved account/person/session/grant information
 * can be passed to this helper; no raw tokens, email, IP or request body.
 */
export type SessionSecurityAction =
  | "identity.session.started"
  | "identity.session.revoked"
  | "identity.session.revoked_remote"
  | "identity.sessions.revoked_all"
  | "identity.sessions.revoked_all_admin"
  | "identity.sessions.revoked_grant"
  | "identity.membership.selected";

export type SessionSecurityEvidence = {
  action: SessionSecurityAction;
  /** Effective account represented by the grant selected for this event. */
  accountId: string;
  /** Account that owns the server-issued session, which can differ while switching. */
  sessionAccountId?: string;
  actorPersonId: string | null;
  sessionId: string;
  grantId?: string | null;
  role?: string | null;
  method?: "email_link" | "local_demo_code";
  targetSessionId?: string;
  revokedCount?: number;
  requestId?: string;
};

/** A single, typed account-scoped audit shape for successful session changes. */
export async function recordSessionSecurityEvent(tx: MutationTx, evidence: SessionSecurityEvidence) {
  const {
    action, accountId, sessionAccountId, actorPersonId, sessionId,
    grantId, role, method, targetSessionId, revokedCount, requestId,
  } = evidence;
  const sessionOwnerAccountId = sessionAccountId ?? accountId;
  await writeAudit(tx, {
    actorPersonId,
    action,
    resourceType: "account",
    resourceId: sessionOwnerAccountId,
    scope: {},
    context: {
      accountId,
      sessionAccountId: sessionOwnerAccountId,
      sessionId,
      grantId: grantId ?? null,
      role: role ?? null,
      outcome: "success",
      ...(method ? { method } : {}),
      ...(targetSessionId ? { targetSessionId } : {}),
      ...(revokedCount !== undefined ? { revokedCount } : {}),
      ...(requestId ? { requestId } : {}),
    },
  });
}

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { accessAccounts, accessSessions, accountPersonGrants } from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { LOCAL_DEMO_ADMIN } from "@/domain/local-demo-access";
import { getCommandContext } from "./command-context.server";
import { recordSessionSecurityEvent } from "./session-security-audit.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

const disableInput = z.object({
 accountId: z.string().uuid(),
 reason: z.string().trim().min(10).max(500),
}).strict();

/**
 * Only a non-delegated registrar holding the
 * verified admin.manage capability may disable an entire access account.
 */
async function requireAdminRegistrar() {
 const actor = await getCommandContext(getRequest());
 if (actor.role !== "registrar" || !actor.actorPersonId || actor.sessionAccountId)
  throw new AuthorizationError("real school registrar");
 assertCapability(actor, "admin.manage");
 return actor;
}

/**
 * Lock and verify the target account before any write. Disabling is reserved
 * for pure family accounts: EVERY grant must be a guardian/student membership
 * inside the registrar's own verified Organization (and Site, when the grant
 * is site-bound) scope. Self-disable, staff-role accounts, grant-less
 * accounts and the local demo admin are refused.
 */
async function scopedDisableTarget(
 tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
 actor: Awaited<ReturnType<typeof requireAdminRegistrar>>,
 accountId: string,
) {
 if (accountId === actor.accountId)
  throw new AuthorizationError("registrar cannot disable their own account");
 const [account] = await tx.select({
  id: accessAccounts.id,
  emailNormalized: accessAccounts.emailNormalized,
  disabled: accessAccounts.disabled,
 }).from(accessAccounts).where(eq(accessAccounts.id, accountId))
  .for("update").limit(1);
 if (!account) throw new AuthorizationError("existing access account");
 if (account.emailNormalized === LOCAL_DEMO_ADMIN.email)
  throw new AuthorizationError("local demo admin account");
 const grants = await tx.select({
  id: accountPersonGrants.id,
  role: accountPersonGrants.role,
  organizationId: accountPersonGrants.organizationId,
  siteId: accountPersonGrants.siteId,
 }).from(accountPersonGrants).where(eq(accountPersonGrants.accountId, accountId));
 if (!grants.length) throw new AuthorizationError("account access grants");
 for (const grant of grants) {
  if (grant.role !== "guardian" && grant.role !== "student")
   throw new AuthorizationError("family access account only");
  if (!grant.organizationId || !actor.scope.organizationIds?.includes(grant.organizationId))
   throw new AuthorizationError("account grant organization scope");
  if (grant.siteId && !actor.scope.siteIds?.includes(grant.siteId))
   throw new AuthorizationError("account grant site scope");
 }
 return { account, grants };
}

/**
 * Whole-account disable: locks the account row, flags it disabled, revokes
 * EVERY live session on the account (not only bound ones), and appends audit
 * and domain-event history in one transaction. Already-disabled accounts are
 * an idempotent no-op. No restore path exists in P0.
 */
export const disableAccessAccount = createServerFn({ method: "POST" })
 .validator((value: unknown) => disableInput.parse(value))
 .handler(async ({ data }) => {
  const actor = await requireAdminRegistrar();
  return db.transaction(async tx => {
   const { account, grants } = await scopedDisableTarget(tx, actor, data.accountId);
   // Idempotent: an already disabled account is a no-op with no duplicate
   // audit or event history.
   if (account.disabled) return { disabled: false as const };
   const now = new Date();
   await tx.update(accessAccounts).set({ disabled: true, updatedAt: now })
    .where(eq(accessAccounts.id, account.id));
   const revoked = await tx.update(accessSessions).set({ revokedAt: now, updatedAt: now })
    .where(and(
     eq(accessSessions.accountId, account.id),
     isNull(accessSessions.revokedAt),
    )).returning({ id: accessSessions.id });
   await writeAudit(tx, {
    actorPersonId: actor.actorPersonId,
    action: "identity.account.disabled",
    resourceType: "access_account",
    resourceId: account.id,
    scope: { organizationId: grants[0]?.organizationId ?? null },
    before: { disabled: false },
    after: { disabled: true, reason: data.reason },
    context: { accountId: actor.accountId, sessionId: actor.sessionId, grantId: actor.grantId },
   });
   if (revoked.length) await recordSessionSecurityEvent(tx, {
    action: "identity.sessions.revoked_all_admin",
    accountId: account.id,
    actorPersonId: actor.actorPersonId,
    sessionId: actor.sessionId,
    role: "registrar",
    revokedCount: revoked.length,
   });
   await emitEvent(tx, {
    eventType: EventTypes.AccessAccountDisabled,
    aggregateType: "access_account",
    aggregateId: account.id,
    actorPersonId: actor.actorPersonId,
    organizationId: grants[0]?.organizationId ?? null,
    payload: { reason: data.reason, grantCount: grants.length, revokedSessions: revoked.length },
   });
   return { disabled: true as const };
  });
 });

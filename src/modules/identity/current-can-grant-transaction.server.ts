import { sql } from "drizzle-orm";
import type { db } from "@/db/client";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { accessSessionCookie, hashAccessSecret } from "@/domain/access-tokens";
import { readCookie } from "@/domain/session-cookies";
import { isDemoAccountEmail } from "@/domain/local-demo-access";

type Tx = Pick<typeof db, "execute">;

/** Exact resource-grant scope, never a Site favorite or expanded org-wide Site list. */
export type CANGrantScope = {
  roles: readonly string[];
  organizationId: string | null;
  siteId: string | null;
};

/**
 * P0 one-Person cutover primitive: lock and revalidate the SAME real CAN
 * session and original scoped grant inside a protected write transaction.
 *
 * No canonical Account, Person, cookie, crosswalk, or implicit role mapping.
 * This establishes current identity/grant only: independent official review,
 * role eligibility, Site operating authority, RLS, consent and resource
 * conditions must be enforced separately by the owning command.
 *
 * Call after getIdentityContext() and before an authorized mutation, in the
 * same transaction as the write. Never use this to elevate a caller's role.
 */
export async function assertCurrentCANGrantForMutation(
  tx: Tx,
  request: Request,
  actor: AccessContext,
  expected: CANGrantScope,
): Promise<void> {
  if (!actor.accountId || !actor.sessionId || !actor.grantId ||
      !actor.actorPersonId || !actor.role || actor.sessionAccountId ||
      !expected.roles.includes(actor.role) ||
      (actor.scope.organizationIds?.length ?? 0) !== (expected.organizationId ? 1 : 0) ||
      (expected.organizationId &&
        actor.scope.organizationIds?.[0] !== expected.organizationId) ||
      actor.grantSiteId !== expected.siteId ||
      (expected.siteId && !actor.scope.siteIds?.includes(expected.siteId))) {
    throw new AuthorizationError("exact CAN Person and role grant");
  }
  const raw = readCookie(request, accessSessionCookie);
  const pepper = process.env.CAN_ACCESS_TOKEN_PEPPER;
  if (!raw || !/^[A-Za-z0-9_-]{40,}$/.test(raw) ||
      !pepper || pepper.length < 32) {
    throw new AuthorizationError("current CAN session");
  }
  const digest = hashAccessSecret(raw, pepper);

  const result = await tx.execute(sql`
    SELECT account.email_normalized AS email
    FROM public.access_sessions session
    JOIN public.access_accounts account
      ON account.id=session.account_id
    JOIN public.account_person_grants current_grant
      ON current_grant.id=session.active_grant_id
     AND current_grant.account_id=account.id
    JOIN public.people person ON person.id=account.person_id
    WHERE session.secret_hash=${digest}::text
      AND session.id=${actor.sessionId}::uuid
      AND account.id=${actor.accountId}::uuid
      AND account.person_id=${actor.actorPersonId}::uuid
      AND current_grant.id=${actor.grantId}::uuid
      AND current_grant.person_id=person.id
      AND current_grant.role=${actor.role}::text
      AND current_grant.organization_id
        IS NOT DISTINCT FROM ${expected.organizationId}::uuid
      AND current_grant.site_id
        IS NOT DISTINCT FROM ${expected.siteId}::uuid
      AND current_grant.active=true AND person.active=true
      AND account.disabled=false
      AND account.email_verified_at IS NOT NULL
      AND session.revoked_at IS NULL
      AND session.expires_at>clock_timestamp()
      AND session.updated_at>clock_timestamp()-interval '30 minutes'
      AND (NOT session.shared_device OR
        session.last_activity_at>clock_timestamp()-interval '5 minutes')
    FOR SHARE OF session,account,current_grant,person
  `);
  if (result.rows.length !== 1 ||
      typeof result.rows[0]?.email !== "string" ||
      isDemoAccountEmail(result.rows[0].email)) {
    throw new AuthorizationError("current verified exact CAN grant");
  }
}

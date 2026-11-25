import { sql } from "drizzle-orm";
import type { db } from "@/db/client";
import type { AccessContext } from "@/domain/access-context";
import { hasValidAccessGrantScope } from "@/domain/access-grant-scope";
import { AuthorizationError } from "@/domain/command-context";
import { accessSessionCookie, hashAccessSecret } from "@/domain/access-tokens";
import { readCookie } from "@/domain/session-cookies";
import { LOCAL_DEMO_ADMIN } from "@/domain/local-demo-access";

type Tx = Pick<typeof db, "execute">;

/** Exact resource-grant scope, never a Site favorite or expanded org-wide Site list. */
export type CANGrantScope = {
  roles: readonly string[];
  organizationId: string | null;
  siteId: string | null;
  /** Optional organization classification required by independently governed reviewers. */
  organizationType?: string;
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
      actor.delegatedByPlatformOwner || actor.delegationMode ||
      !hasValidAccessGrantScope({role:actor.role,organizationId:expected.organizationId,siteId:expected.siteId}) ||
      !expected.roles.includes(actor.role) ||
      (expected.organizationType && !expected.organizationId) ||
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
  // Purpose-scoped reviewers must lock the actual institution classification.
  // Other grants, including account-only roles, need no Organization join.
  const organizationJoin = expected.organizationType
    ? sql`JOIN public.organizations verified_org
        ON verified_org.id=current_grant.organization_id`
    : sql``;
  const organizationCheck = expected.organizationType
    ? sql`AND verified_org.type::text=${expected.organizationType}::text`
    : sql``;
  const ownerId=actor.impersonatedByAccountId ?? actor.accountId;
  const lockTargets = expected.organizationType
    ? sql`FOR SHARE OF session,session_owner,target_account,current_grant,person,verified_org`
    : sql`FOR SHARE OF session,session_owner,target_account,current_grant,person`;

  const result = await tx.execute(sql`
    SELECT target_account.id AS effective_account_id
    FROM public.access_sessions session
    JOIN public.access_accounts session_owner
      ON session_owner.id=session.account_id
    JOIN public.account_person_grants current_grant
      ON current_grant.id=session.active_grant_id
    JOIN public.access_accounts target_account
      ON target_account.id=current_grant.account_id
    JOIN public.people person ON person.id=current_grant.person_id
    ${organizationJoin}
    WHERE session.secret_hash=${digest}::text
      AND session.id=${actor.sessionId}::uuid
      AND session_owner.id=${ownerId}::uuid
      AND target_account.id=${actor.accountId}::uuid
      AND target_account.person_id=${actor.actorPersonId}::uuid
      AND current_grant.id=${actor.grantId}::uuid
      AND current_grant.person_id=person.id
      AND current_grant.role=${actor.role}::text
      AND current_grant.organization_id
        IS NOT DISTINCT FROM ${expected.organizationId}::uuid
      AND current_grant.site_id
        IS NOT DISTINCT FROM ${expected.siteId}::uuid
      ${organizationCheck}
      AND current_grant.active=true AND person.active=true
      AND target_account.disabled=false AND target_account.email_verified_at IS NOT NULL
      AND session_owner.disabled=false AND session_owner.email_verified_at IS NOT NULL
      AND session.revoked_at IS NULL
      -- This is a direct-grant transaction guard (with the existing exact
      -- Demo Admin exception below), not a Platform Owner delegation grant.
      -- Recheck while holding the session row lock: a stale direct request
      -- must not authorize a write after a delegation has begun.
      AND session.delegated_grant_id IS NULL
      AND session.delegated_mode IS NULL
      AND session.delegated_until IS NULL
      AND session.delegated_reason IS NULL
      AND session.expires_at>clock_timestamp()
      AND session.updated_at>clock_timestamp()-interval '30 minutes'
      AND (NOT session.shared_device OR
        session.last_activity_at>clock_timestamp()-interval '5 minutes')
      AND NOT EXISTS(
        SELECT 1 FROM public.account_person_grants conflict
        WHERE conflict.account_id=target_account.id AND conflict.active
          AND conflict.person_id<>person.id
      )
      AND (
        (current_grant.account_id=session_owner.id
          AND ${actor.impersonatedByAccountId ?? null}::uuid IS NULL)
        OR
        (session_owner.id=${LOCAL_DEMO_ADMIN.accountId}::uuid
          AND session_owner.email_normalized=${LOCAL_DEMO_ADMIN.email}
          AND ${actor.impersonatedByAccountId ?? null}::uuid=session_owner.id
          AND EXISTS (
            SELECT 1 FROM public.account_person_grants admin_grant
            WHERE admin_grant.id=${LOCAL_DEMO_ADMIN.grantId}::uuid
              AND admin_grant.account_id=session_owner.id
              AND admin_grant.person_id=session_owner.person_id
              AND admin_grant.role='site_admin' AND admin_grant.active
              AND admin_grant.organization_id=current_grant.organization_id
              AND admin_grant.site_id=current_grant.site_id
          )
          AND NOT EXISTS(
            SELECT 1 FROM public.account_person_grants foreign_owner
            WHERE foreign_owner.account_id=session_owner.id
              AND foreign_owner.active
              AND foreign_owner.person_id<>session_owner.person_id
          ))
      )
    ${lockTargets}
  `);
  if(result.rows.length!==1 ||
     result.rows[0]?.effective_account_id!==actor.accountId)
    throw new AuthorizationError("current verified exact CAN grant");

}

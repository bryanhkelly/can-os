import { sql } from "drizzle-orm";
import type { db } from "@/db/client";
import { accessSessionCookie, hashAccessSecret } from "@/domain/access-tokens";
import { readCookie } from "@/domain/session-cookies";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import { assertCurrentCanonicalStaffForMutation } from "./canonical-transaction-authorization.server";

type WriteTransaction = Pick<typeof db, "execute">;

/**
 * An issuer has an ordinary CAN login and a separately reviewed, unexpired
 * capability approval. A Site Admin or Registrar role alone cannot issue.
 *
 * The approval row is locked through the surrounding award transaction, so
 * concurrent revocation cannot commit between the approval check and the
 * award write. A canonical native-only cookie never grants issuer authority.
 */
export async function assertCurrentCredentialIssuer(
  tx: WriteTransaction,
  request: Request,
  actor: CommandContext,
): Promise<void> {
  await assertCurrentCanonicalStaffForMutation(tx, request, actor);

  const raw = readCookie(request, accessSessionCookie);
  const pepper = process.env.CAN_ACCESS_TOKEN_PEPPER;
  if (!raw || !/^[A-Za-z0-9_-]{40,}$/.test(raw) ||
      !pepper || pepper.length < 32) {
    throw new AuthorizationError("single verified CAN issuer session");
  }
  const digest = hashAccessSecret(raw, pepper);
  // The award triggers independently validate this same current bearer.
  // Transaction-local only; no raw cookie or caller-selected actor is persisted.
  await tx.execute(sql`SELECT set_config('can.credential.session_hash', ${digest}, true)`);
  const result = await tx.execute(sql`
    SELECT approval.id
    FROM education_v30.v301_can_staff_session_context(${digest}::text) staff
    JOIN public.access_sessions can_session
      ON can_session.id=staff.session_id
        AND can_session.secret_hash=${digest}::text
    JOIN public.account_person_grants current_grant ON current_grant.id=staff.grant_id
      AND current_grant.account_id=can_session.account_id AND current_grant.active
    JOIN public.access_accounts issuer ON issuer.id=can_session.account_id
      AND issuer.person_id=staff.person_id AND NOT issuer.disabled
      AND issuer.email_verified_at IS NOT NULL AND issuer.private_access_code_hash IS NULL
      AND issuer.email_normalized NOT LIKE '%.demo'
    JOIN public.people person ON person.id=staff.person_id AND person.active
    JOIN public.canonical_sensitive_capability_approvals approval
      ON approval.account_person_grant_id=staff.grant_id
        AND approval.requested_by_can_account_id=can_session.account_id
    WHERE education_v30.v301_can_sensitive_capability(
      ${digest}::text,'credential.issue'::text
    )
      AND approval.status='approved'
      AND approval.capability_code='credential.issue'
      AND approval.revoked_at IS NULL
      AND approval.approved_until > clock_timestamp()
      AND staff.person_id=${actor.actorPersonId}::uuid
      AND staff.organization_id=${actor.scope.organizationIds?.[0]}::uuid
      AND staff.site_id=${actor.scope.siteIds?.[0]}::uuid
      AND can_session.delegated_grant_id IS NULL
      AND can_session.delegated_mode IS NULL
      AND can_session.delegated_until IS NULL
      AND can_session.delegated_reason IS NULL
      AND can_session.revoked_at IS NULL
      AND can_session.expires_at>clock_timestamp()
      AND can_session.updated_at>clock_timestamp()-interval '30 minutes'
      AND (NOT can_session.shared_device OR can_session.last_activity_at>clock_timestamp()-interval '5 minutes')
      AND can_session.active_grant_id=current_grant.id
    FOR SHARE OF approval,can_session,current_grant,issuer,person
  `);
  if (result.rows.length !== 1) {
    throw new AuthorizationError("current independent credential issuer approval");
  }
}

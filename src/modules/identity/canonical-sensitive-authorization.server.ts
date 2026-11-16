import { sql } from "drizzle-orm";
import type { db } from "@/db/client";
import { accessSessionCookie, hashAccessSecret } from "@/domain/access-tokens";
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

  const raw = (request.headers.get("cookie") ?? "").split(";")
    .map(piece => piece.trim())
    .find(piece => piece.startsWith(accessSessionCookie + "="))
    ?.slice(accessSessionCookie.length + 1);
  const pepper = process.env.CAN_ACCESS_TOKEN_PEPPER;
  if (!raw || !/^[A-Za-z0-9_-]{40,}$/.test(raw) ||
      !pepper || pepper.length < 32) {
    throw new AuthorizationError("single verified CAN issuer session");
  }
  const digest = hashAccessSecret(raw, pepper);
  const result = await tx.execute(sql`
    SELECT approval.id
    FROM education_v30.v301_can_staff_session_context(${digest}::text) staff
    JOIN education_v30.canonical_sensitive_capability_approvals approval
      ON approval.canonical_grant_id=staff.grant_id
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
    FOR SHARE OF approval
  `);
  if (result.rows.length !== 1) {
    throw new AuthorizationError("current independent credential issuer approval");
  }
}

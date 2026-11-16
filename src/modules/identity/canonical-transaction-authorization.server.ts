import { sql } from "drizzle-orm";
import type { db } from "@/db/client";
import { accessSessionCookie, hashAccessSecret } from "@/domain/access-tokens";
import {
  canonicalSessionRowSchema, projectCanonicalCommandContext,
} from "@/domain/canonical-access";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import { canonicalSessionDigestFromRequest } from "./canonical-command-context.server";

type CanonicalWriteTransaction = Pick<typeof db, "execute">;

/**
 * Mutation-time defense against stale authorization established before
 * expensive resource checks or locks. Call just before protected writes,
 * inside the same transaction as the business mutation.
 *
 * Native and CAN SSO paths must both revalidate the actual hashed session,
 * current role, Person, organization and Site. Never accept caller-provided
 * identities or cross-Site role fallback.
 *
 * This is not a replacement for table-specific mutation permissions,
 * row-level policies or the transactional resource relationship checks.
 */
export async function assertCurrentCanonicalStaffForMutation(
  tx: CanonicalWriteTransaction,
  request: Request,
  actor: CommandContext,
): Promise<void> {
  if (!actor.actorPersonId ||
      (actor.role !== "site_admin" && actor.role !== "registrar") ||
      actor.scope.organizationIds?.length !== 1 ||
      actor.scope.siteIds?.length !== 1) {
    throw new AuthorizationError("exact active canonical staff context");
  }

  const rawCanSession = (request.headers.get("cookie") ?? "")
    .split(";").map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(accessSessionCookie + "="))
    ?.slice(accessSessionCookie.length + 1);

  let rows: unknown[];
  if (rawCanSession !== undefined) {
    if (!/^[A-Za-z0-9_-]{40,}$/.test(rawCanSession) ||
        !process.env.CAN_ACCESS_TOKEN_PEPPER ||
        process.env.CAN_ACCESS_TOKEN_PEPPER.length < 32) {
      throw new AuthorizationError("current CAN staff session");
    }
    const digest = hashAccessSecret(rawCanSession, process.env.CAN_ACCESS_TOKEN_PEPPER);
    const result = await tx.execute(sql`
      SELECT account_id,session_id,grant_id,person_id,
        role_code,organization_id,site_id
      FROM education_v30.v301_can_staff_session_context(${digest}::text)
    `);
    rows = result.rows;
  } else {
    const digest = canonicalSessionDigestFromRequest(request);
    const result = await tx.execute(sql`
      SELECT account_id,session_id,grant_id,person_id,
        role_code,organization_id,site_id
      FROM education_v30.v301_canonical_session_context(${digest}::text)
    `);
    rows = result.rows;
  }

  if (rows.length !== 1) {
    throw new AuthorizationError("current canonical staff grant");
  }
  const current = canonicalSessionRowSchema.parse(rows[0]);
  const projected = projectCanonicalCommandContext(current);
  if (projected.actorPersonId !== actor.actorPersonId ||
      projected.role !== actor.role ||
      projected.scope.organizationIds?.[0] !== actor.scope.organizationIds[0] ||
      projected.scope.siteIds?.[0] !== actor.scope.siteIds[0]) {
    throw new AuthorizationError("unchanged exact canonical staff assignment");
  }
}

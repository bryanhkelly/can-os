import { Pool, type PoolClient } from "@neondatabase/serverless";
import type { AccessContext } from "@/domain/access-context";
import { canonicalRestrictedAuthUrlValid } from "@/domain/canonical-auth-connection";
import {
  canonicalAuthReaderDatabaseRole, canonicalSessionRowSchema,
  projectCanonicalCommandContext,
} from "@/domain/canonical-access";
import { accessSessionCookie, hashAccessSecret } from "@/domain/access-tokens";
import { canResolveCanSiteStaff } from "@/domain/canonical-can-sso";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";

/**
 * The existing CAN cookie is the only staff credential. Authentication is
 * established by getCommandContext before entering this service.
 *
 * The restricted SQL function independently revalidates the SAME hashed
 * session, the original active CAN grant and Person, the reviewed Person and
 * Site mappings, canonical staff grant and effective Site relationship.
 *
 * This service MUST NOT read canonical identities with the general/owner
 * DATABASE_URL, infer authorization from email or issue a second login.
 */
export async function resolveCanonicalSiteStaffFromCan(
  actor: AccessContext,
  request: Request,
): Promise<CommandContext> {
  if (!canResolveCanSiteStaff(actor) || !actor.sessionId) {
    throw new AuthorizationError("verified CAN Site administrator or registrar");
  }
  const rawCookie = (request.headers.get("cookie") ?? "")
    .split(";").map(value => value.trim())
    .find(value => value.startsWith(accessSessionCookie + "="))
    ?.slice(accessSessionCookie.length + 1);
  if (!rawCookie || !/^[A-Za-z0-9_-]{40,}$/.test(rawCookie)) {
    throw new AuthorizationError("authenticated CAN session");
  }
  const pepper = process.env.CAN_ACCESS_TOKEN_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new AuthorizationError("CAN session configuration");
  }
  const connectionString = process.env.CAN_CANONICAL_AUTH_DATABASE_URL;
  if (!canonicalRestrictedAuthUrlValid(connectionString, process.env.DATABASE_URL)) {
    throw new AuthorizationError("restricted canonical staff reader configuration");
  }

  const digest = hashAccessSecret(rawCookie, pepper);
  const pool = new Pool({
    connectionString, max: 1, connectionTimeoutMillis: 3000,
  });
  let client: PoolClient | undefined;
  let rows: Record<string, unknown>[] = [];
  try {
    client = await pool.connect();
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL ROLE ${canonicalAuthReaderDatabaseRole}`);
    const result = await client.query(
      "SELECT account_id, session_id, grant_id, person_id, role_code, organization_id, site_id " +
      "FROM education_v30.v301_can_staff_session_context($1::text)",
      [digest],
    );
    rows = result.rows;
    await client.query("COMMIT");
  } catch {
    if (client) {
      try { await client.query("ROLLBACK"); } catch { /* fail closed */ }
    }
    // No SQL errors, identifiers, secrets or account existence are returned.
    throw new AuthorizationError("restricted canonical staff reader unavailable");
  } finally {
    client?.release();
    await pool.end().catch(() => { /* access already failed closed */ });
  }

  if (rows.length !== 1) {
    throw new AuthorizationError("current verified Site staff mapping");
  }
  const native = canonicalSessionRowSchema.parse(rows[0]);
  // The restricted projection must describe this exact verified CAN session.
  // A new selected role or logged-out session may not reuse another context.
  if (native.session_id !== actor.sessionId ||
      native.role_code !== actor.role ||
      !native.site_id || !actor.actorPersonId || !actor.grantSiteId) {
    throw new AuthorizationError("current active CAN membership");
  }
  return projectCanonicalCommandContext(native);
}

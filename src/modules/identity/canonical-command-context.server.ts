import { createHash } from "node:crypto";
import { Pool } from "@neondatabase/serverless";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import {
  canonicalAuthReaderDatabaseRole,
  canonicalSessionCookie,
  canonicalSessionRowSchema,
  type CanonicalSessionRow,
  projectCanonicalCommandContext,
} from "@/domain/canonical-access";

/**
 * A completely native v3.0.1 session. No account, Person, Site, grant or
 * Organization is read from public-schema identity records.
 */
export function canonicalSessionDigestFromRequest(request: Request): string {
  const cookie = request.headers.get("cookie") ?? "";
  const raw = cookie.split(";").map(item => item.trim())
    .find(item => item.startsWith(canonicalSessionCookie + "="))
    ?.slice(canonicalSessionCookie.length + 1);
  if (!raw || !/^[A-Za-z0-9_-]{40,}$/.test(raw)) {
    throw new AuthorizationError("authenticated session");
  }
  const pepper = process.env.CAN_CANONICAL_ACCESS_TOKEN_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new AuthorizationError("canonical session configuration");
  }
  return createHash("sha256")
    .update(pepper).update(":").update(raw).digest("hex");
}

export async function getCanonicalSessionRow(request: Request): Promise<CanonicalSessionRow> {
  const digest = canonicalSessionDigestFromRequest(request);
  // Dedicated restricted login: never switch roles from the app's broad
  // DATABASE_URL connection. This connection has no raw identity-table reads.
  const connectionString = process.env.CAN_CANONICAL_AUTH_DATABASE_URL;
  if (!connectionString) throw new AuthorizationError("canonical session reader configuration");
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  let records: Array<Record<string, unknown>> = [];
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL ROLE ${canonicalAuthReaderDatabaseRole}`);
    const result = await client.query(
      `SELECT account_id, session_id, grant_id, person_id,
              role_code, organization_id, site_id
         FROM education_v30.v301_canonical_session_context($1::text)`,
      [digest],
    );
    records = result.rows;
    await client.query("COMMIT");
  } catch {
    try { await client.query("ROLLBACK"); } catch { /* Preserve original denial. */ }
    throw new AuthorizationError("canonical session reader unavailable");
  } finally {
    client.release();
    await pool.end();
  }

  if (records.length !== 1) throw new AuthorizationError("authenticated session");
  return canonicalSessionRowSchema.parse(records[0]);
}

/** Public command contexts never expose the database session id. */
export async function getCanonicalCommandContext(request: Request): Promise<CommandContext> {
  return projectCanonicalCommandContext(await getCanonicalSessionRow(request));
}

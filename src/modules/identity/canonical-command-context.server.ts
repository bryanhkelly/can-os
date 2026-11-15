import { createHash, randomBytes } from "node:crypto";
import { canonicalRestrictedAuthUrlValid } from "@/domain/canonical-auth-connection";
import { accessSessionCookie } from "@/domain/access-tokens";
import { getCommandContext } from "./command-context.server";
import { resolveCanonicalSiteStaffFromCan } from "./canonical-can-staff-bridge.server";
import { Pool, type PoolClient } from "@neondatabase/serverless";
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
  if (!canonicalRestrictedAuthUrlValid(connectionString, process.env.DATABASE_URL))
    throw new AuthorizationError("dedicated restricted canonical session reader configuration");
  const pool = new Pool({ connectionString, max: 1 });
  let client: PoolClient | undefined;
  let records: Array<Record<string, unknown>> = [];
  try {
    client = await pool.connect();
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
    if (client) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve original denial. */ }
    }
    throw new AuthorizationError("canonical session reader unavailable");
  } finally {
    client?.release();
    await pool.end();
  }

  if (records.length !== 1) throw new AuthorizationError("authenticated session");
  return canonicalSessionRowSchema.parse(records[0]);
}

/**
 * Readiness requires an actual restricted login, SET ROLE, and execution of
 * the same canonical session projection used by authenticated requests.
 * Never test with the general/owner database URL or a real user's token.
 *
 * A brief cache avoids opening a new connection for every page visit.
 * No credentials, SQL errors or account information enter the response.
 */
let readerProbeCache: { until: number; ready: boolean } = { until: 0, ready: false };
let pendingReaderProbe: Promise<boolean> | null = null;

async function runCanonicalReaderProbe(): Promise<boolean> {
  const url = process.env.CAN_CANONICAL_AUTH_DATABASE_URL;
  if (!canonicalRestrictedAuthUrlValid(url, process.env.DATABASE_URL) ||
      (process.env.CAN_CANONICAL_ACCESS_TOKEN_PEPPER?.length ?? 0) < 32) return false;
  let pool: Pool | undefined;
  let client: PoolClient | undefined;
  try {
    pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 3000 });
    client = await pool.connect();
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL ROLE ${canonicalAuthReaderDatabaseRole}`);
    const result = await client.query(
      "SELECT account_id FROM education_v30.v301_canonical_session_context($1::text)",
      [randomBytes(32).toString("hex")],
    );
    await client.query("ROLLBACK");
    // The random digest must match no session. Success proves the restricted
    // projection is callable, not that a privileged DB role can SELECT tables.
    return result.rows.length === 0;
  } catch {
    if (client) {
      try { await client.query("ROLLBACK"); } catch { /* fail closed */ }
    }
    return false;
  } finally {
    client?.release();
    if (pool) await pool.end().catch(() => { /* probe still fails closed */ });
  }
}

export async function probeCanonicalAuthReader(): Promise<boolean> {
  if (!canonicalRestrictedAuthUrlValid(
    process.env.CAN_CANONICAL_AUTH_DATABASE_URL, process.env.DATABASE_URL,
  ) || (process.env.CAN_CANONICAL_ACCESS_TOKEN_PEPPER?.length ?? 0) < 32) return false;
  const now = Date.now();
  if (readerProbeCache.until > now) return readerProbeCache.ready;
  if (!pendingReaderProbe) {
    pendingReaderProbe = runCanonicalReaderProbe().then(ready => {
      readerProbeCache = { ready, until: Date.now() + (ready ? 60_000 : 15_000) };
      return ready;
    }).finally(() => { pendingReaderProbe = null; });
  }
  return pendingReaderProbe;
}

/**
 * One sign-in for CAN school staff. Resolve the verified CAN session first
 * when its active grant is Site Admin or Registrar, then require independent
 * Person + Site bridges and a live matching canonical grant. This projection
 * creates no second bearer cookie and grants no rights for unmapped schools.
 *
 * Other canonical roles retain their existing native session handling until
 * their separately reviewed identity/role mappings are supported. A broken
 * CAN session must never fall back to a native cookie or silently switch roles.
 */
export async function getCanonicalCommandContext(request: Request): Promise<CommandContext> {
  const cookies = (request.headers.get("cookie") ?? "").split(";")
    .map(item => item.trim());
  const hasCan = cookies.some(item => item.startsWith(accessSessionCookie + "="));
  const hasNative = cookies.some(item => item.startsWith(canonicalSessionCookie + "="));
  if (hasCan) {
    const actor = await getCommandContext(request);
    if (actor.role === "site_admin" || actor.role === "registrar") {
      return resolveCanonicalSiteStaffFromCan(actor);
    }
    if (!hasNative) {
      throw new AuthorizationError("native canonical authorization for this role");
    }
  }
  return projectCanonicalCommandContext(await getCanonicalSessionRow(request));
}

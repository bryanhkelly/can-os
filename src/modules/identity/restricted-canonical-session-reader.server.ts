import { Pool, type PoolClient } from "@neondatabase/serverless";
import { getRequestScopedResource } from "@/db/client";
import { canonicalRestrictedAuthUrlValid } from "@/domain/canonical-auth-connection";
import { canonicalAuthReaderDatabaseRole } from "@/domain/canonical-access";
import { AuthorizationError } from "@/domain/command-context";

let nodePool: Pool | undefined;
let nodePoolUrl: string | undefined;

/** The only connection manager for canonical session projections.
 * Workers close the restricted pool with the request, Node reuses a pool.
 * Every query runs under the restricted role in a read-only transaction.
 */
export async function readRestrictedCanonicalSession(
  projection: "native" | "can_staff",
  digest: string,
): Promise<Record<string, unknown>[]> {
  const connectionString = process.env.CAN_CANONICAL_AUTH_DATABASE_URL;
  if (!canonicalRestrictedAuthUrlValid(connectionString, process.env.DATABASE_URL))
    throw new AuthorizationError("restricted canonical reader configuration");
  const scoped = getRequestScopedResource("canonical-auth-pool", () => {
    const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 3000 });
    return { pool, close: () => pool.end() };
  });
  if (!scoped && (!nodePool || nodePoolUrl !== connectionString)) {
    // Node only: refresh the restricted pool on configuration rotation.
    const previous = nodePool;
    nodePool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 3000 });
    nodePoolUrl = connectionString;
    if (previous) void previous.end().catch(() => {});
  }
  const pool = scoped?.pool ?? nodePool!;
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL ROLE ${canonicalAuthReaderDatabaseRole}`);
    const query = projection === "can_staff"
      ? "SELECT account_id, session_id, grant_id, person_id, role_code, organization_id, site_id FROM education_v30.v301_can_staff_session_context($1::text)"
      : "SELECT account_id, session_id, grant_id, person_id, role_code, organization_id, site_id FROM education_v30.v301_canonical_session_context($1::text)";
    const result = await client.query(query, [digest]);
    await client.query("COMMIT");
    return result.rows as Record<string, unknown>[];
  } catch (error) {
    const category = error instanceof Error && error.name === "AbortError"
      ? "timeout" : "connection_or_query";
    // No exception messages, SQL, tokens, identifiers or URLs enter logs.
    console.warn("Restricted canonical session read failed", { projection, category });
    if (client) {
      try { await client.query("ROLLBACK"); } catch { /* fail closed */ }
    }
    throw new AuthorizationError("restricted canonical session reader unavailable");
  } finally {
    client?.release();
  }
}

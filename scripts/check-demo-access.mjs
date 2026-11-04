import { Pool } from "@neondatabase/serverless";
import { LOCAL_DEMO_ACCOUNTS, LOCAL_DEMO_ADMIN, isApprovedDemoGrant } from "../src/domain/local-demo-access.ts";

// Operator-only, read-only check. Run with the same environment as the server.
// Never print driver errors, environment values, session hashes or query rows.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Demo access check failed: DATABASE_URL is missing.");
  process.exitCode = 1;
} else if (!process.env.CAN_ACCESS_TOKEN_PEPPER || process.env.CAN_ACCESS_TOKEN_PEPPER.length < 32) {
  console.error("Demo access check failed: CAN_ACCESS_TOKEN_PEPPER must contain at least 32 characters.");
  process.exitCode = 1;
} else {
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 10000 });
  let client;
  let stage = "database_connection";
  try {
    client = await pool.connect();
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '10s'");
    stage = "authentication_schema";
    await client.query("SELECT route, window_started_at, request_count FROM auth_request_rate_limits LIMIT 0");
    await client.query("SELECT id, account_id, secret_hash, active_grant_id, expires_at, revoked_at, created_at, updated_at FROM access_sessions LIMIT 0");
    await client.query('SELECT actor_person_id, action, resource_type, resource_id, scope, context FROM audit_events LIMIT 0');
    stage = "canonical_demo_grants";
    const { rows } = await client.query(`
      SELECT a.id AS "accountId", a.email_normalized AS email,
        g.id, g.person_id AS "personId", g.role,
        g.organization_id AS "organizationId", g.site_id AS "siteId"
      FROM access_accounts a
      JOIN account_person_grants g ON g.account_id = a.id
      JOIN people p ON p.id = g.person_id
      WHERE a.email_normalized = ANY($1::text[])
        AND NOT a.disabled AND g.active AND p.active
    `, [LOCAL_DEMO_ACCOUNTS.map(account => account.email)]);
    for (const account of LOCAL_DEMO_ACCOUNTS) {
      const candidates = rows.filter(row => row.accountId === account.accountId);
      const approved = candidates.filter(row => row.email === account.email && isApprovedDemoGrant(row, row.email));
      const valid = account.accountId === LOCAL_DEMO_ADMIN.accountId
        ? approved.some(row => row.id === LOCAL_DEMO_ADMIN.grantId)
        : candidates.length === 1 && approved.length === 1;
      if (!valid) throw new Error("Demo membership unavailable");
    }
    await client.query("ROLLBACK");
    console.log(`Demo access configuration, schema and all ${LOCAL_DEMO_ACCOUNTS.length} canonical memberships verified (read-only).`);
    console.log("Session creation, transactional auditing and browser sign-in still require an end-to-end check.");
  } catch {
    console.error(`Demo access check failed: ${stage}. No credentials or database errors were logged.`);
    process.exitCode = 1;
  } finally {
    if (client) {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
    await pool.end();
  }
}

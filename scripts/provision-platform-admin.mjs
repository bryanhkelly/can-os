#!/usr/bin/env node
/**
 * Explicit operator-run, audited App Admin provisioning. NEVER invoked on
 * login, on deployment, in a seed, or through a public endpoint.
 *
 * PLATFORM_ADMIN_EMAIL=... PLATFORM_ADMIN_APPROVER_EMAIL=... \
 * PLATFORM_ADMIN_TICKET=... DATABASE_URL=... \
 * node scripts/provision-platform-admin.mjs              # read-only preflight
 * ... node scripts/provision-platform-admin.mjs --execute # explicit write
 *
 * Both accounts must already exist, be verified, non-demo and represent
 * different real Persons. An account-wide role has NULL organization/site.
 * The approver must have an independently active can_network_steward
 * institutional can_network organization grant or an existing app_admin grant. This script cannot
 * bootstrap an unapproved reviewer and cannot replace external approval.
 */
import { Pool } from "@neondatabase/serverless";

const email = (process.env.PLATFORM_ADMIN_EMAIL ?? "").trim().toLowerCase();
const approverEmail = (process.env.PLATFORM_ADMIN_APPROVER_EMAIL ?? "").trim().toLowerCase();
const ticket = (process.env.PLATFORM_ADMIN_TICKET ?? "").trim();
const execute = process.argv.includes("--execute");
const PRODUCTION_PROJECT_ID = "sweet-hall-62441909";
const PRODUCTION_BRANCH_ID = "br-restless-sea-ar9ooo55";
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL required");
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(approverEmail) ||
    email === approverEmail || email.endsWith(".demo") || approverEmail.endsWith(".demo")) {
  throw Error("Two distinct, valid non-demo account email addresses are required");
}
if (ticket.length < 12 || ticket.length > 240) {
  throw Error("A substantive external authorization ticket reference is required");
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let client;
try {
  client = await pool.connect();
  await client.query(execute ? "BEGIN" : "BEGIN READ ONLY");
  // Privileged provisioning must never silently target a preview, fork,
  // recovery branch, or another project. Fail closed before any row locks
  // or writes, even for a dry run. This is the exact deployed main target.
  const targetDatabase = await client.query(`
    SELECT current_setting('neon.project_id', true) AS project_id,
           current_setting('neon.branch_id', true) AS branch_id,
           current_database() AS database_name
  `);
  const deployed = targetDatabase.rows[0];
  if (deployed?.project_id !== PRODUCTION_PROJECT_ID ||
      deployed?.branch_id !== PRODUCTION_BRANCH_ID ||
      deployed?.database_name !== "neondb") {
    throw Error("BLOCKED: App Admin provisioning must target CAN OS Neon production main");
  }
  const result = await client.query(`
    SELECT a.id, a.person_id, a.email_normalized, a.email_verified_at,
      a.disabled, p.active AS person_active
    FROM public.access_accounts a
    JOIN public.people p ON p.id = a.person_id
    WHERE a.email_normalized = ANY($1::text[])
    ORDER BY a.email_normalized ${execute ? "FOR UPDATE OF a" : ""}
  `, [[email, approverEmail]]);
  const target = result.rows.find(row => row.email_normalized === email);
  const approver = result.rows.find(row => row.email_normalized === approverEmail);
  if (!target || !approver || target.disabled || approver.disabled ||
      !target.email_verified_at || !approver.email_verified_at ||
      !target.person_active || !approver.person_active ||
      target.person_id === approver.person_id) {
    throw Error("Both distinct existing account Persons must be active, verified and enabled");
  }
  // A verified email address alone does not make someone an authorized
  // approver. Require a separately granted, currently active institutional
  // reviewer or existing platform administrator membership.
  const authority = await client.query(`
    SELECT count(*)::int AS count
    FROM public.account_person_grants g
    LEFT JOIN public.organizations o ON o.id = g.organization_id
    WHERE g.account_id = $1 AND g.person_id = $2 AND g.active = true
      AND (
        (g.role = 'can_network_steward' AND g.organization_id IS NOT NULL
          AND g.site_id IS NULL AND o.type = 'can_network')
        OR
        (g.role = 'app_admin' AND g.organization_id IS NULL AND g.site_id IS NULL)
      )
  `, [approver.id, approver.person_id]);
  if (Number(authority.rows[0]?.count) !== 1) {
    throw Error("Independent approver must have exactly one current approved institutional or platform reviewer grant");
  }
  // Serialize concurrent provisioning requests for this specific account.
  if (execute) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1::text))",
      ["platform-admin-provision:" + target.id]);
  }
  const conflicts = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM public.account_person_grants
    WHERE account_id = $1 AND active = true AND person_id <> $2
  `, [target.id, target.person_id]);
  if (Number(conflicts.rows[0]?.count) > 0) {
    throw Error("Target has conflicting active Person grants");
  }
  const existing = await client.query(`
    SELECT id, person_id, organization_id, site_id
    FROM public.account_person_grants
    WHERE account_id = $1 AND role = 'app_admin' AND active = true
    ${execute ? "FOR UPDATE" : ""}
  `, [target.id]);
  if (existing.rows.some(row => row.person_id !== target.person_id ||
      row.organization_id !== null || row.site_id !== null) ||
      existing.rows.length > 1) {
    throw Error("Conflicting App Admin grant must be resolved by an independent reviewer");
  }
  if (!execute) {
    await client.query("ROLLBACK");
    console.log("PREFLIGHT PASS: verified distinct account and approver; no changes made.");
    console.log(existing.rows.length ? "An eligible App Admin grant is already active." :
      "An account-wide App Admin grant can be provisioned with --execute.");
  } else if (existing.rows.length === 1) {
    await client.query("ROLLBACK");
    console.log("NO CHANGE: verified App Admin grant already active.");
  } else {
    const created = await client.query(`
      INSERT INTO public.account_person_grants
        (account_id, person_id, role, organization_id, site_id, active)
      VALUES ($1, $2, 'app_admin', NULL, NULL, true)
      RETURNING id
    `, [target.id, target.person_id]);
    const grantId = created.rows[0].id;
    await client.query(`
      INSERT INTO public.domain_events
        (event_type, aggregate_type, aggregate_id, actor_person_id,
          status, payload, processed_at)
      VALUES ('identity.platform_admin.provisioned', 'PlatformAdminGrant',
        $1, $2, 'processed',
        jsonb_build_object('accountId', $3::uuid, 'ticket', $4::text,
          'scope', 'platform', 'grantedRole', 'app_admin'),
        now())
    `, [grantId, approver.person_id, target.id, ticket]);
    await client.query("COMMIT");
    console.log("COMMITTED: one audited account-wide App Admin grant provisioned.");
    console.log("Account can sign in using normal verified CAN email authentication. No shared password issued.");
  }
} catch (error) {
  if (client) await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  client?.release();
  await pool.end();
}

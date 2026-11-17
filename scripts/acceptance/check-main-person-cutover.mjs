#!/usr/bin/env node
/**
 * CAN OS P0 shared Person identity cutover preflight (READ ONLY).
 *
 * CAN_MAIN_PERSON_CUTOVER_CHECK=1 DATABASE_URL=<CAN Neon main> \
 *   npm run verify:person:main-cutover
 *
 * This checks readiness for RETIRING the native identity model. It does not
 * mutate identity, reconcile by email, issue staff grants or approve anything.
 * A BLOCKED result is expected until all native FK/auth consumers are cut over.
 */
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";

const PROJECT = "sweet-hall-62441909";
const MAIN = "br-restless-sea-ar9ooo55";
assert.equal(process.env.CAN_MAIN_PERSON_CUTOVER_CHECK, "1",
  "Explicit CAN_MAIN_PERSON_CUTOVER_CHECK=1 required");
assert.ok(process.env.DATABASE_URL, "DATABASE_URL required");
const sql = neon(process.env.DATABASE_URL);

const [target] = await sql`
  SELECT current_setting('neon.project_id',true) AS project_id,
         current_setting('neon.branch_id',true) AS branch_id,
         current_database() AS database_name
`;
assert.equal(target?.project_id, PROJECT, "Refusing non-CAN OS project");
assert.equal(target?.branch_id, MAIN, "Refusing branch other than Neon main");
assert.equal(target?.database_name, "neondb", "Refusing unexpected database");

const [model] = await sql`
 SELECT
   (SELECT count(*)::int FROM public.people) AS platform_people,
   (SELECT count(*)::int FROM public.access_accounts) AS platform_accounts,
   (SELECT count(*)::int FROM public.access_accounts WHERE person_id IS NOT NULL) AS anchored_accounts,
   (SELECT count(*)::int FROM education_v30.persons) AS native_people,
   (SELECT count(*)::int FROM education_v30.canonical_accounts) AS native_accounts,
   (SELECT count(*)::int FROM education_v30.canonical_sessions
      WHERE revoked_at IS NULL AND expires_at > now()) AS active_native_sessions,
   (SELECT count(*)::int FROM public.access_account_canonical_principals) AS staff_correspondence_rows,
   (SELECT count(*)::int FROM public.access_account_noncredit_principals) AS learner_correspondence_rows,
   (SELECT count(*)::int FROM pg_constraint
      WHERE contype='f' AND confrelid='education_v30.persons'::regclass) AS native_person_fks,
   (SELECT count(*)::int FROM pg_constraint
      WHERE contype='f' AND confrelid='public.people'::regclass) AS platform_person_fks,
   (SELECT count(*)::int FROM public.account_person_grants g
      JOIN public.access_accounts a ON a.id=g.account_id
      WHERE g.active AND a.person_id IS DISTINCT FROM g.person_id) AS active_identity_mismatches,
   (SELECT count(*)::int FROM (
      SELECT a.id
      FROM public.access_accounts a
      JOIN public.account_person_grants g ON g.account_id=a.id
      GROUP BY a.id HAVING count(DISTINCT g.person_id)>1
   ) historic_conflicts) AS historical_multi_person_accounts,
   (SELECT count(*)::int FROM pg_trigger t
      WHERE t.tgname='can_account_person_immutable'
        AND t.tgrelid='public.access_accounts'::regclass
        AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal) AS account_immutable_triggers,
   (SELECT count(*)::int FROM pg_trigger t
      WHERE t.tgname='can_account_grants_one_person_guard'
        AND t.tgrelid='public.account_person_grants'::regclass
        AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal) AS grant_guard_triggers,
   (SELECT count(*)::int FROM pg_indexes
      WHERE schemaname='public' AND tablename='access_accounts'
        AND indexname='access_accounts_person_id_uq') AS unique_person_indexes
`;

const blockers = [];
if (model.anchored_accounts !== model.platform_accounts)
  blockers.push("Some CAN accounts lack immutable Person ownership");
if (model.active_identity_mismatches !== 0)
  blockers.push("Active account grants disagree with Person ownership");
if (model.account_immutable_triggers !== 1 ||
    model.grant_guard_triggers !== 1 || model.unique_person_indexes !== 1)
  blockers.push("CAN Person schema invariants are incomplete");
if (model.native_people !== 0 || model.native_accounts !== 0 ||
    model.active_native_sessions !== 0)
  blockers.push("Native identity or active sessions require evidence-preserving migration");
if (model.native_person_fks !== 0)
  blockers.push("Native Person foreign keys still own authorization/data references");
if (model.staff_correspondence_rows !== 0 ||
    model.learner_correspondence_rows !== 0)
  blockers.push("Existing identity correspondence rows require explicit retirement review");
if (model.historical_multi_person_accounts !== 0)
  blockers.push("Conflicting historical Person grants require audit-preserving review");

// Empty correspondence tables are still transitional schema, not accepted
// one-Person architecture. Do not drop them until all live consumers migrate.
const correspondenceTables = await sql`
 SELECT n.nspname||'.'||c.relname AS relation
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p')
 AND c.relname IN ('access_account_canonical_principals',
                   'access_account_noncredit_principals')
 ORDER BY relation
`;
if (correspondenceTables.length)
  blockers.push("Transitional identity tables remain in schema");

// Code and browser cutover, independent staff approvals, guardian isolation,
// current-scope RLS and revocation tests need separate recorded acceptance.
const result = {
  target: "CAN OS Neon main", readOnly: true,
  state: blockers.length ? "BLOCKED" : "DATA_PREFLIGHT_ONLY",
  ...model, transitionalTables: correspondenceTables.map(row=>row.relation),
  blockers,
  caveat: "Not proof of application cutover, independent approval, RLS, consent, revocation or browser E2E"
};
console.log(JSON.stringify(result,null,2));
if (process.argv.includes("--strict") && blockers.length) process.exitCode = 1;

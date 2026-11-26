#!/usr/bin/env node
/**
 * Read-only retirement preflight, not a migration or a credential generator.
 * Run after the coordinated domain/credential migrations and before deleting
 * the shared-code compatibility path. Never outputs email, IDs or secrets.
 */
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("BLOCKED: DATABASE_URL required");
const sql = neon(process.env.DATABASE_URL);
const [target] = await sql`
 SELECT current_setting('neon.project_id',true) AS project_id,
 current_setting('neon.branch_id',true) AS branch_id,
 current_database() AS database_name,
 EXISTS (SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='access_accounts'
     AND column_name='private_access_code_hash') AS credential_schema,
 EXISTS (SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='access_sessions'
     AND column_name='authentication_method') AS provenance_schema
`;
assert.equal(target?.project_id,"sweet-hall-62441909","Wrong Neon project");
assert.equal(target?.branch_id,"br-restless-sea-ar9ooo55","Wrong Neon branch");
assert.equal(target?.database_name,"neondb","Wrong database");
assert.equal(target?.credential_schema,true,"BLOCKED: migration 0131 missing");
assert.equal(target?.provenance_schema,true,"BLOCKED: migration 0132 missing");
const [counts] = await sql`
 SELECT
   (SELECT count(*)::int FROM public.access_accounts
    WHERE NOT disabled AND email_normalized LIKE '%.demo'
      AND private_access_code_hash IS NULL) AS enabled_legacy_accounts,
   (SELECT count(*)::int FROM public.access_accounts
    WHERE NOT disabled AND email_normalized LIKE '%.demo'
      AND private_access_code_hash IS NOT NULL) AS individually_credentialed_accounts,
   (SELECT count(*)::int FROM public.access_sessions s
    JOIN public.access_accounts a ON a.id=s.account_id
    WHERE s.revoked_at IS NULL AND s.expires_at>now()
      AND a.email_normalized LIKE '%.demo'
      AND s.authentication_method IS DISTINCT FROM 'private_access_code') AS unexpired_legacy_sessions,
   (SELECT count(DISTINCT a.id)::int FROM public.access_accounts a
    JOIN public.account_person_grants g ON g.account_id=a.id AND g.person_id=a.person_id
    JOIN public.people p ON p.id=a.person_id
    WHERE g.active AND g.role='platform_owner'
      AND g.organization_id IS NULL AND g.site_id IS NULL
      AND p.active AND NOT a.disabled
      AND a.email_verified_at IS NOT NULL AND a.email_normalized NOT LIKE '%.demo'
      AND a.private_access_code_hash IS NULL
      AND split_part(a.email_normalized,'@',2) !~ '(^|[.])(test|invalid|localhost|example)$'
      AND split_part(a.email_normalized,'@',2) !~ '(^|[.])example[.](com|net|org)$'
   ) AS verified_owners
`;
const [inventory] = await sql`
 WITH account_state AS (
   SELECT a.id, a.person_id, p.active AS person_active,
     count(g.id) FILTER (WHERE g.active) AS active_grants,
     count(g.id) FILTER (WHERE g.active AND g.person_id IS DISTINCT FROM a.person_id) AS conflicting_grants,
     bool_or(g.role IN ('account_holder','student','guardian')) FILTER (WHERE g.active) AS family_or_personal,
     bool_or(g.role NOT IN ('site_admin','registrar','teacher','room_facilitator','specialist',
       'counselor','site_staff','site_leader','paraeducator','site_website_editor','academic_content_creator',
       'account_holder','student','guardian')) FILTER (WHERE g.active) AS other_role
   FROM public.access_accounts a
   LEFT JOIN public.people p ON p.id=a.person_id
   LEFT JOIN public.account_person_grants g ON g.account_id=a.id
   WHERE NOT a.disabled AND a.email_normalized LIKE '%.demo' AND a.private_access_code_hash IS NULL
   GROUP BY a.id,p.active
 )
 SELECT
   count(*) FILTER (WHERE person_id IS NULL OR person_active IS NOT TRUE OR active_grants=0 OR conflicting_grants>0)::int AS identity_review,
   count(*) FILTER (WHERE person_id IS NOT NULL AND person_active AND active_grants>0 AND conflicting_grants=0 AND other_role)::int AS role_review,
   count(*) FILTER (WHERE person_id IS NOT NULL AND person_active AND active_grants>0 AND conflicting_grants=0 AND NOT other_role AND family_or_personal)::int AS family_personal_review,
   count(*) FILTER (WHERE person_id IS NOT NULL AND person_active AND active_grants>0 AND conflicting_grants=0 AND NOT other_role AND NOT family_or_personal)::int AS operational_credential_review
 FROM account_state
`;
const ready=counts.enabled_legacy_accounts===0 &&
 counts.unexpired_legacy_sessions===0 && counts.verified_owners>0;
console.log(JSON.stringify({status:ready?"eligible_for_retirement_review":"blocked",...counts,inventory,
 limitation:"Counts do not establish secure credential handoff or successful sign-in; require separate operator evidence before retirement."},null,2));
process.exitCode=ready?0:1;

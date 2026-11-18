#!/usr/bin/env node
/** Read-only main-only database proof for protected public table relocations.
 * CAN_MAIN_GOVERNANCE_RELOCATION_CHECK=1 DATABASE_URL=<main> node scripts/acceptance/check-main-governance-leaf-consolidation.mjs
 */
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
assert.equal(process.env.CAN_MAIN_GOVERNANCE_RELOCATION_CHECK,"1","Explicit main-only opt-in required");
assert.ok(process.env.DATABASE_URL,"Missing Neon main DATABASE_URL");
const sql=neon(process.env.DATABASE_URL);
const [target]=await sql`
 SELECT current_setting('neon.project_id',true) AS project,
 current_setting('neon.branch_id',true) AS branch,
 current_database() AS database
`;
assert.equal(target?.project,"sweet-hall-62441909");
assert.equal(target?.branch,"br-restless-sea-ar9ooo55");
assert.equal(target?.database,"neondb");

const rows=await sql`
WITH expected (table_name,outgoing_fks,triggers) AS (VALUES
 ('funding_eligibility_evaluations',4,1),
 ('network_governance_delegations',5,1),
 ('qualification_readiness_review_links',3,1),
 ('quality_reassessments',4,1),
 ('site_requirement_evaluations',5,1),
 ('assurance_case_events',3,2),
 ('feedback_subjects',10,1),
 ('governance_policy_adoptions',7,1),
 ('governance_policy_scopes',9,1),
 ('learner_data_disclosures',4,1)
)
SELECT e.table_name,
 to_regclass('education_v30.'||e.table_name) IS NULL AS native_retired,
 to_regclass('public.'||e.table_name) IS NOT NULL AS public_present,
 COALESCE(c.relrowsecurity,false) AS rls,
 COALESCE(c.relforcerowsecurity,false) AS forced_rls,
 (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policies,
 (SELECT count(*)::int FROM pg_constraint f WHERE f.conrelid=c.oid AND f.contype='f') AS fk_count,
 (SELECT count(*)::int FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) AS trigger_count,
 e.outgoing_fks AS expected_fks,e.triggers AS expected_triggers
FROM expected e LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||e.table_name)
ORDER BY e.table_name
`;
const failures=rows.filter(row=>!row.native_retired || !row.public_present ||
 !row.rls || !row.forced_rls || row.policies!==1 ||
 row.fk_count!==row.expected_fks || row.trigger_count!==row.expected_triggers);
console.log(JSON.stringify({target:"CAN OS Neon main",readOnly:true,tables:rows.length,
 expectedTables:10,foreignKeys:rows.reduce((s,x)=>s+x.fk_count,0),
 passed:rows.length===10&&failures.length===0,failures},null,2));
if(rows.length!==10||failures.length)process.exitCode=1;

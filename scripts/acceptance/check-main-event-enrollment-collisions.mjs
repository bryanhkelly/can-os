#!/usr/bin/env node
/**
 * Read-only, fail-closed reconciliation inventory for remaining duplicate
 * table names in production main. This creates no bridges, mutates no data,
 * and does NOT grant permission to drop any legacy relations.
 *
 * CAN_MAIN_COLLISION_CHECK=1 DATABASE_URL=<Neon main> node \
 *   scripts/acceptance/check-main-event-enrollment-collisions.mjs
 */
import { neon } from "@neondatabase/serverless";

const PROJECT="sweet-hall-62441909";
const MAIN="br-restless-sea-ar9ooo55";
const collisions=[
  "audit_events","domain_events","enrollments",
  "graduation_decisions","qualification_definitions","transcript_issuances",
];
const expectedPublicAtAudit={
  audit_events:836,
  domain_events:268,
  enrollments:178,
  graduation_decisions:0,
  qualification_definitions:9,
  transcript_issuances:4,
};

async function run(){
  if(process.env.CAN_MAIN_COLLISION_CHECK!=="1"||!process.env.DATABASE_URL)
    throw new Error("Explicit opt-in and main DATABASE_URL are required");
  const sql=neon(process.env.DATABASE_URL);
  const [target]=await sql`
    SELECT current_setting('neon.project_id',true) project,
      current_setting('neon.branch_id',true) branch
  `;
  if(target?.project!==PROJECT||target?.branch!==MAIN)
    throw new Error("Refusing database outside CAN OS Neon main");

  const inventory=await sql`
    WITH names AS (SELECT unnest(${collisions}::text[]) AS name)
    SELECT names.name,
      old.oid::text legacy_oid, existing.oid::text public_oid,
      old.relrowsecurity AS legacy_rls,
      old.relforcerowsecurity AS legacy_force_rls,
      existing.relrowsecurity AS public_rls,
      existing.relforcerowsecurity AS public_force_rls,
      (SELECT count(*)::int FROM pg_constraint fk
       WHERE fk.contype='f' AND fk.confrelid=old.oid) AS legacy_inbound_fks,
      (SELECT count(*)::int FROM pg_constraint fk
       WHERE fk.contype='f' AND fk.confrelid=existing.oid) AS public_inbound_fks,
      (SELECT count(*)::int FROM pg_proc p WHERE p.prosrc ILIKE '%'||names.name||'%')
        AS routine_text_mentions,
      (SELECT array_agg(a.attname ORDER BY a.attnum)
       FROM pg_attribute a WHERE a.attrelid=old.oid
         AND a.attnum>0 AND NOT a.attisdropped) AS legacy_columns,
      (SELECT array_agg(a.attname ORDER BY a.attnum)
       FROM pg_attribute a WHERE a.attrelid=existing.oid
         AND a.attnum>0 AND NOT a.attisdropped) AS public_columns
    FROM names
    LEFT JOIN pg_class old ON old.relname=names.name
      AND old.relnamespace=to_regnamespace('education_v30') AND old.relkind='r'
    LEFT JOIN pg_class existing ON existing.relname=names.name
      AND existing.relnamespace=to_regnamespace('public') AND existing.relkind='r'
    ORDER BY names.name
  `;

  // Direct counts are fixed to audited relation names. A name cannot be
  // interpolated into an SQL identifier by an untrusted caller.
  const [counts]=await sql`
    SELECT
      (SELECT count(*)::int FROM education_v30.audit_events) legacy_audit,
      (SELECT count(*)::int FROM public.audit_events) public_audit,
      (SELECT count(*)::int FROM education_v30.domain_events) legacy_domain,
      (SELECT count(*)::int FROM public.domain_events) public_domain,
      (SELECT count(*)::int FROM education_v30.enrollments) legacy_enrollments,
      (SELECT count(*)::int FROM public.enrollments) public_enrollments,
      (SELECT count(*)::int FROM education_v30.graduation_decisions) legacy_graduation,
      (SELECT count(*)::int FROM public.graduation_decisions) public_graduation,
      (SELECT count(*)::int FROM education_v30.qualification_definitions) legacy_qualification,
      (SELECT count(*)::int FROM public.qualification_definitions) public_qualification,
      (SELECT count(*)::int FROM education_v30.transcript_issuances) legacy_transcript,
      (SELECT count(*)::int FROM public.transcript_issuances) public_transcript
  `;
  const rowNames=[
    ["audit_events","legacy_audit","public_audit"],
    ["domain_events","legacy_domain","public_domain"],
    ["enrollments","legacy_enrollments","public_enrollments"],
    ["graduation_decisions","legacy_graduation","public_graduation"],
    ["qualification_definitions","legacy_qualification","public_qualification"],
    ["transcript_issuances","legacy_transcript","public_transcript"],
  ];
  const result=inventory.map(row=>{
    const [,legacyKey,publicKey]=rowNames.find(([name])=>name===row.name);
    return {
      table:row.name,legacy_oid:row.legacy_oid,public_oid:row.public_oid,
      legacy_rows:counts[legacyKey],public_rows:counts[publicKey],
      public_rows_at_prior_audit:expectedPublicAtAudit[row.name],
      public_rows_have_not_disappeared:counts[publicKey]>=expectedPublicAtAudit[row.name],
      legacy_inbound_fks:row.legacy_inbound_fks,
      public_inbound_fks:row.public_inbound_fks,
      legacy_rls:row.legacy_rls,public_rls:row.public_rls,
      routine_text_mentions:row.routine_text_mentions,
      columns_equal:JSON.stringify(row.legacy_columns)===JSON.stringify(row.public_columns),
    };
  });
  console.log(JSON.stringify({
    project:target.project,branch:target.branch,read_only:true,
    conflicts:result,drop_allowed:false,
  },null,2));
  // The old authoritative event, enrollment and identity contracts must be
  // retired by explicit, reviewed migrations. A zero-row table is not proof
  // that its referenced identity or its permission model may be discarded.
  if(result.some(row=>!row.legacy_oid||!row.public_oid||
      !row.public_rows_have_not_disappeared||!row.legacy_rls&&row.legacy_rows>0))
    throw new Error("Collision state changed; reconcile before proceeding");
  process.exitCode=2;
  console.error("BLOCKED: collisions and dependent FKs remain; no DROP is authorized");
}
run().catch(error=>{
 console.error(error instanceof Error?error.message:String(error));
 process.exitCode=1;
});

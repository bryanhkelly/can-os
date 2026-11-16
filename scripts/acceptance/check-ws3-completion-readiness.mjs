/**
 * WS3 READ-ONLY schema/authority preflight for an isolated Neon QA branch.
 * Does not seed participants, mutate evidence, issue awards, or enable flags.
 *
 * CAN_WS3_SCHEMA_VALIDATION=1 DATABASE_URL=<isolated QA URL> \
 *   node scripts/acceptance/check-ws3-completion-readiness.mjs
 */
import { Pool } from "@neondatabase/serverless";

if (process.env.CAN_WS3_SCHEMA_VALIDATION !== "1")
  throw new Error("Explicit CAN_WS3_SCHEMA_VALIDATION=1 required");
if (!process.env.DATABASE_URL)
  throw new Error("An explicitly selected isolated QA DATABASE_URL is required");

const pool = new Pool({connectionString:process.env.DATABASE_URL});
const critical = [
  "class_enrollments","class_outcomes","class_awards",
  "noncredit_registrations","noncredit_completion_policies",
  "noncredit_completion_decisions","noncredit_completion_certificates",
  "learning_award_issuances","learning_award_issuance_events",
  "participation_attributions","noncredit_self_enrollment_claims",
];
try {
  const client=await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const {rows:objects}=await client.query(
      `SELECT c.relname AS name,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,
        count(p.polname)::integer AS policies
       FROM pg_class c
       JOIN pg_namespace n ON n.oid=c.relnamespace
       LEFT JOIN pg_policy p ON p.polrelid=c.oid
       WHERE n.nspname='education_v30' AND c.relkind='r'
         AND c.relname = ANY($1::text[])
       GROUP BY c.relname,c.relrowsecurity,c.relforcerowsecurity`,
      [critical],
    );
    const indexed=new Map(objects.map(row=>[row.name,row]));
    const missing=critical.filter(name=>!indexed.has(name));
    const unsafe=critical.filter(name=>indexed.has(name)&&(
      !indexed.get(name).rls||!indexed.get(name).forced||
      indexed.get(name).policies<1
    ));
    const {rows:functions}=await client.query(
      `SELECT
        to_regprocedure('education_v30.v28_validate_completion()') IS NOT NULL
          AS validates_noncredit,
        to_regprocedure('education_v30.v301_credential_is_current(uuid)') IS NOT NULL
          AS checks_award_current,
        to_regprocedure('education_v30.v301_can_sensitive_capability(text,text)') IS NOT NULL
          AS checks_issuer_access`,
    );
    const {rows:triggers}=await client.query(
      `SELECT c.relname AS name,count(t.oid)::integer AS triggers
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       LEFT JOIN pg_trigger t ON t.tgrelid=c.oid AND NOT t.tgisinternal
       WHERE n.nspname='education_v30'
         AND c.relname IN ('class_outcomes','noncredit_completion_decisions',
           'learning_award_issuance_events')
       GROUP BY c.relname`,
    );
    const {rows:counts}=await client.query(
      `SELECT
       (SELECT count(*) FROM education_v30.class_enrollments) AS class_participants,
       (SELECT count(*) FROM education_v30.noncredit_registrations) AS noncredit_participants,
       (SELECT count(*) FROM education_v30.noncredit_completion_decisions) AS noncredit_decisions,
       (SELECT count(*) FROM education_v30.learning_award_issuances) AS issued_awards`,
    );
    await client.query("COMMIT");
    const f=functions[0]??{};
    const triggerMap=new Map(triggers.map(row=>[row.name,Number(row.triggers)]));
    const noTriggers=["class_outcomes","noncredit_completion_decisions",
      "learning_award_issuance_events"].filter(name=>!(triggerMap.get(name)>0));
    const okay=missing.length===0&&unsafe.length===0&&noTriggers.length===0&&
      f.validates_noncredit&&f.checks_award_current&&f.checks_issuer_access;
    console.log(JSON.stringify({
      preflight:"WS3 read-only canonical completion authority",pass:!!okay,
      missing,unsafe,noTriggers,functionPresence:f,
      counts:counts[0],rowLevelSecurity:objects,
      warning:"Schema readiness only; does not test a real learner, operator, approved policy, award grant, or authenticated UI.",
    },null,2));
    if (!okay) process.exitCode=1;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}

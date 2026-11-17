/**
 * WS3 transaction-rolled-back SQL migration preflight, isolated QA only.
 *
 * CAN_WS3_ROLLBACK_QA=1 CAN_WS3_QA_BRANCH=test01 DATABASE_URL=... \
 *   node scripts/acceptance/dry-run-ws3-migrations.mjs
 *
 * Never commits DDL, enables feature flags, touches production, or seeds data.
 * Explicitly require a nonproduction Neon branch name; the operator must
 * supply a URL for that branch (this script cannot resolve branch identity
 * from an arbitrary connection string).
 */
import { readFileSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";

if (process.env.CAN_WS3_ROLLBACK_QA!=="1" ||
    process.env.CAN_WS3_QA_BRANCH!=="test01" ||
    !process.env.DATABASE_URL)
  throw new Error("Set CAN_WS3_ROLLBACK_QA=1, CAN_WS3_QA_BRANCH=test01 and the test01 DATABASE_URL.");

const patches=[
  "patch-ws3-source-bound-evidence.sql",
  "patch-ws3-class-completion-policy-pins.sql",
  "patch-ws3-class-governed-outcomes.sql",
  "patch-ws3-independent-evidence-review.sql",
].map(name=>"database/canonical/v3.0.1/"+name);

/** Split SQL on semicolons only outside quoted SQL and dollar-quoted
 * PL/pgSQL bodies. The connector's naive semicolon splitter is not safe
 * for schema functions with procedural statements.
 */
function statements(source){
  const sql=source.split("\n")
    .filter(line=>!line.trimStart().startsWith("--")).join("\n");
  const out=[];
  let quote=null,buffer="",i=0;
  while(i<sql.length){
    if(quote==="'"){
      const ch=sql[i++];buffer+=ch;
      if(ch==="'"){
        if(sql[i]==="'")buffer+=sql[i++];
        else quote=null;
      }
      continue;
    }
    if(quote){
      if(sql.startsWith(quote,i)){buffer+=quote;i+=quote.length;quote=null;}
      else buffer+=sql[i++];
      continue;
    }
    const delim=/^\$[a-zA-Z0-9_]*\$/.exec(sql.slice(i));
    if(delim){quote=delim[0];buffer+=quote;i+=quote.length;continue;}
    if(sql[i]==="'"){quote="'";buffer+=sql[i++];continue;}
    if(sql[i]===";"){
      const fragment=buffer.trim();
      if(fragment && !["BEGIN","COMMIT"].includes(fragment.toUpperCase()))
        out.push(fragment);
      buffer="";i++;continue;
    }
    buffer+=sql[i++];
  }
  if(quote)throw new Error("Unterminated SQL quote in WS3 migration");
  const tail=buffer.trim();
  if(tail && !["BEGIN","COMMIT"].includes(tail.toUpperCase()))
    out.push(tail);
  return out;
}

const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
const client=await pool.connect();
let passed=false;
try{
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '2s'");
  await client.query("SET LOCAL statement_timeout = '15s'");
  await client.query("SAVEPOINT ws3_migration_dry_run");
  let executed=0;
  for(const patch of patches){
    const statementsForPatch=statements(readFileSync(patch,"utf8"));
    for(const statement of statementsForPatch){
      await client.query(statement);
      executed++;
    }
  }
  const check=await client.query(`
    SELECT
      (SELECT count(*) FROM pg_trigger
        WHERE NOT tgisinternal AND tgname IN (
          'ws3_completion_evidence_guard_trg',
          'ws3_class_completion_policy_guard_trg',
          'ws3_class_enrollment_completion_pin_trg',
          'ws3_class_completion_pin_guard_trg',
          'ws3_class_completion_decision_insert_guard',
          'ws3_review_request_mutation_guard'))::integer AS "guardTriggers",
      (SELECT count(*) FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='education_v30'
          AND c.relname IN (
            'learning_completion_evidence_bindings',
            'class_completion_policy_versions',
            'class_enrollment_completion_pins',
            'learning_completion_evidence_review_requests')
          AND c.relrowsecurity AND c.relforcerowsecurity)::integer AS "protectedTables",
      (education_v30.v301_ws3_class_completion_is_current(
        '00000000-0000-4000-8000-000000000000'::uuid) IS FALSE)
        AS "unknownSourceNotCompleted"
  `);
  const row=check.rows[0];
  if(Number(row.guardTriggers)!==6 ||
     Number(row.protectedTables)!==4 ||
     row.unknownSourceNotCompleted!==true)
    throw new Error("WS3 migration guards or Class validity are incomplete");
  // Exercise the actual PostgreSQL trigger on a disposable, temporary
  // minimal fixture, not on any real Class Enrollment or learner outcome.
  // Three privileged historical mutations must be denied while an unrelated
  // assessment history update keeps the original Class schema behavior.
  await client.query(`
    CREATE TEMP TABLE ws3_guard_fixture(
      id integer PRIMARY KEY, outcome_kind text NOT NULL,
      source_kind text NOT NULL, result_code text NOT NULL
    ) ON COMMIT DROP
  `);
  await client.query(`
    INSERT INTO ws3_guard_fixture VALUES
      (1,'completion','ws3_governed','completed'),
      (2,'assessment','external','original')
  `);
  await client.query(`
    CREATE TRIGGER ws3_guard_fixture_trg BEFORE UPDATE OR DELETE
      ON ws3_guard_fixture FOR EACH ROW
      EXECUTE FUNCTION education_v30.ws3_guard_class_completion_decision()
  `);
  await client.query(`
    DO $ws3_fixture$ DECLARE denied integer:=0;
    BEGIN
      BEGIN
        UPDATE ws3_guard_fixture SET result_code='tampered' WHERE id=1;
      EXCEPTION WHEN check_violation THEN denied:=denied+1; END;
      BEGIN
        DELETE FROM ws3_guard_fixture WHERE id=1;
      EXCEPTION WHEN check_violation THEN denied:=denied+1; END;
      BEGIN
        UPDATE ws3_guard_fixture SET outcome_kind='completion',
          source_kind='ws3_governed' WHERE id=2;
      EXCEPTION WHEN check_violation THEN denied:=denied+1; END;
      IF denied<>3 THEN
        RAISE EXCEPTION 'Expected 3 rejected Class completion mutations, observed %',
          denied;
      END IF;
      UPDATE ws3_guard_fixture SET result_code='revised' WHERE id=2;
    END $ws3_fixture$
  `);
  const {rows:historyGuard}=await client.query(`
    SELECT
      (SELECT result_code='completed' FROM ws3_guard_fixture WHERE id=1)
      AND
      (SELECT result_code='revised' FROM ws3_guard_fixture WHERE id=2)
      AS "historyImmutable"
  `);
  if(historyGuard[0]?.historyImmutable!==true)
    throw new Error("Governed Class history was mutable or non-WS3 outcomes were blocked");
  await client.query("ROLLBACK TO SAVEPOINT ws3_migration_dry_run");
  const undone=await client.query(`
    SELECT to_regclass('education_v30.class_completion_policy_versions') IS NULL
       AND to_regclass('education_v30.learning_completion_evidence_bindings') IS NULL
       AND to_regclass('education_v30.learning_completion_evidence_review_requests') IS NULL
       AS "rolledBack"
  `);
  if(undone.rows[0]?.rolledBack!==true)
    throw new Error("Proposed WS3 schema was not rolled back");
  passed=true;
  console.log(JSON.stringify({
    gate:"WS3 rolled-back isolated-QA migration",
    passed:true,executedStatements:executed,
    guardTriggers:Number(row.guardTriggers),
    protectedTables:Number(row.protectedTables),
    unknownSourceNotCompleted:true,appendOnlyGuardDenied:3,
    unrelatedAssessmentUpdateAllowed:true,changesPersisted:false,
    caveat:"Does not replace restricted staff/learner acceptance, build or integration tests.",
  },null,2));
}finally{
  // Even on failed migration/verification, PostgreSQL rolls the entire test
  // transaction back. No DDL is ever committed.
  try{await client.query("ROLLBACK");}catch{}
  client.release();
  await pool.end();
}
if(!passed)process.exitCode=1;

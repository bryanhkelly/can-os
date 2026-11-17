/**
 * WS3 rollback-only PostgreSQL migration syntax/trigger/RLS preflight.
 * Explicit QA confirmation required; never commits or seeds user data.
 *
 * CAN_WS3_ROLLBACK_DDL=1 CAN_WS3_QA_DATABASE_CONFIRM=1 \
 * DATABASE_URL=<isolated-neon-qa-url> node scripts/acceptance/validate-ws3-rollback-ddl.mjs
 */
import {readFileSync} from "node:fs";
import {Pool} from "@neondatabase/serverless";

if(process.env.CAN_WS3_ROLLBACK_DDL!=="1" ||
   process.env.CAN_WS3_QA_DATABASE_CONFIRM!=="1" ||
   !process.env.DATABASE_URL)
  throw new Error("Explicit rollback-DDL flag, non-production QA confirmation and DATABASE_URL required");

const paths=[
  "database/canonical/v3.0.1/patch-ws3-class-completion-policy-pins.sql",
  "database/canonical/v3.0.1/patch-ws3-source-bound-evidence.sql",
  "database/canonical/v3.0.1/patch-ws3-independent-evidence-review.sql",
  "database/canonical/v3.0.1/patch-ws3-class-governed-outcomes.sql",
];

/** PostgreSQL statement split, preserving strings, comments and PL/pgSQL. */
export function splitStatements(input){
  let statements=[],buffer="",quote=null,index=0;
  while(index<input.length){
    if(quote==="lineComment"){
      if(input[index]==="\n"){quote=null;buffer+="\n";}
      index++;continue;
    }
    if(quote==="single"){
      const ch=input[index++];buffer+=ch;
      if(ch==="'"){
        if(input[index]==="'"){buffer+="'";index++;}
        else quote=null;
      }
      continue;
    }
    if(quote==="double"){
      const ch=input[index++];buffer+=ch;
      if(ch==='"'){
        if(input[index]==='"'){buffer+='"';index++;}
        else quote=null;
      }
      continue;
    }
    if(quote&&quote.startsWith("$")){
      if(input.startsWith(quote,index)){
        buffer+=quote;index+=quote.length;quote=null;
      }else buffer+=input[index++];
      continue;
    }
    if(input.startsWith("--",index)){quote="lineComment";index+=2;continue;}
    const dollar=/^\$[a-zA-Z0-9_]*\$/.exec(input.slice(index));
    if(dollar){quote=dollar[0];buffer+=quote;index+=dollar[0].length;continue;}
    if(input[index]==="'"){quote="single";buffer+=input[index++];continue;}
    if(input[index]==='"'){quote="double";buffer+=input[index++];continue;}
    if(input[index]===";"){
      const value=buffer.trim();
      if(value&&!["BEGIN","COMMIT"].includes(value.toUpperCase()))
        statements.push(value);
      buffer="";index++;continue;
    }
    buffer+=input[index++];
  }
  if(quote&&quote!=="lineComment")
    throw new Error("Unclosed SQL quote or function dollar marker");
  const remaining=buffer.trim();
  if(remaining&&!["BEGIN","COMMIT"].includes(remaining.toUpperCase()))
    statements.push(remaining);
  return statements;
}

const pool=new Pool({connectionString:process.env.DATABASE_URL});
const client=await pool.connect();
let begun=false;
try{
  await client.query("BEGIN");
  begun=true;
  await client.query("SET LOCAL lock_timeout='3000ms'");
  await client.query("SET LOCAL statement_timeout='30000ms'");
  let executed=0;
  for(const path of paths){
    for(const statement of splitStatements(readFileSync(path,"utf8"))){
      await client.query(statement);
      executed++;
    }
  }
  const {rows:objects}=await client.query(
    "SELECT c.relname,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
    "WHERE n.nspname='education_v30' AND c.relname=ANY($1::text[])",
    [[
      "learning_completion_evidence_bindings",
      "learning_completion_evidence_review_requests",
      "class_completion_policy_versions",
      "class_enrollment_completion_pins",
    ]],
  );
  const {rows:triggers}=await client.query(
    "SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname=ANY($1::text[])",
    [[
      "ws3_completion_evidence_guard_trg",
      "ws3_review_request_mutation_guard",
      "ws3_class_completion_policy_guard_trg",
      "ws3_class_enrollment_completion_pin_trg",
      "ws3_class_completion_pin_guard_trg",
      "ws3_class_completion_decision_insert_guard",
    ]],
  );
  const {rows:checks}=await client.query(
    "SELECT to_regprocedure('education_v30.v301_ws3_class_completion_is_current(uuid)') "+
    "IS NOT NULL AS function_installed",
  );
  if(objects.length!==4||objects.some(r=>!r.relforcerowsecurity)||
     triggers.length!==6||checks[0]?.function_installed!==true)
    throw new Error("WS3 proposed schema, forced RLS, triggers or validity function missing");
  console.log(JSON.stringify({
    valid:true,statementsExecuted:executed,
    schemaObjects:objects.length,triggers:triggers.length,
    note:"Schema-only rollback validation; no authenticated writes or application build tested.",
  }));
}finally{
  if(begun)await client.query("ROLLBACK");
  client.release();
  await pool.end();
}

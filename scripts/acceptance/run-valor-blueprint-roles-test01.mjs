#!/usr/bin/env node
/**
 * Executes the already-reviewed, rollback-only Valor SQL Blueprint acceptance
 * against the isolated Neon test01 database using the restricted QA login.
 * This is NOT a signed-in browser test and creates NO persistent fixtures.
 *
 * APP_ENV=test CAN_VALOR_BLUEPRINT_ACCEPTANCE=1 \
 * TEST_DATABASE_URL=<test01-owner-url> \
 * CAN_CANONICAL_TEST_APP_DATABASE_URL=<test01-acceptance-role-url> \
 * npm run db:test:canonical:v301:valor-blueprint-roles
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";

const PROJECT="sweet-hall-62441909";
const BRANCH="br-bitter-feather-ar0u63x7";
const RESTRICTED_USER="can_v301_blueprint_acceptance_app";
const requireEnv=(key)=>{ const v=process.env[key]; if(!v)throw new Error("Missing "+key);return v; };
assert.equal(requireEnv("APP_ENV"),"test");
assert.equal(requireEnv("CAN_VALOR_BLUEPRINT_ACCEPTANCE"),"1");
const ownerUrl=requireEnv("TEST_DATABASE_URL");
const restrictedUrl=requireEnv("CAN_CANONICAL_TEST_APP_DATABASE_URL");
const owner=new URL(ownerUrl);
const restricted=new URL(restrictedUrl);
assert.equal(restricted.username,RESTRICTED_USER,"Use restricted Blueprint QA login");
assert.notEqual(owner.username,restricted.username,"Owner and restricted QA logins must differ");
assert.equal(restricted.hostname,owner.hostname,"Both URLs must target the same Neon endpoint");
assert.equal(restricted.pathname,owner.pathname,"Both URLs must target the same database");
if(process.env.DATABASE_URL){
  assert.notEqual(ownerUrl,process.env.DATABASE_URL,"Never run against production DATABASE_URL");
  assert.notEqual(restrictedUrl,process.env.DATABASE_URL,"Never run using production DATABASE_URL");
}

const source=readFileSync("database/canonical/v3.0.1/accept-valor-blueprint-roles-test01.sql","utf8");
assert.match(source,/ROLLBACK TO SAVEPOINT valor_blueprint_acceptance;/);
assert.match(source,/^ROLLBACK;\s*$/m);
function splitSql(text){
  const statements=[];
  let current="",quoted=false,dollar=null;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(dollar){
      if(text.startsWith(dollar,i)){current+=dollar;i+=dollar.length-1;dollar=null;}
      else current+=c;
      continue;
    }
    if(quoted){
      current+=c;
      if(c==="'"){if(text[i+1]==="'"){current+="'";i++;}else quoted=false;}
      continue;
    }
    if(c==="'"){quoted=true;current+=c;continue;}
    if(c==="$"){
      const match=text.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if(match){dollar=match[0];current+=dollar;i+=dollar.length-1;continue;}
    }
    if(c===";"){if(current.trim())statements.push(current.trim());current="";continue;}
    current+=c;
  }
  if(current.trim())statements.push(current.trim());
  assert(!quoted&&!dollar,"Incomplete SQL quote");
  return statements;
}
const statements=splitSql(source.replace(/^--.*$/gm,""));
assert.equal(statements[0],"BEGIN");
assert.equal(statements.at(-1),"ROLLBACK");

const appPool=new Pool({connectionString:restrictedUrl,max:1,connectionTimeoutMillis:3000});
const ownerPool=new Pool({connectionString:ownerUrl,max:1,connectionTimeoutMillis:3000});
let client;
try {
  client=await appPool.connect();
  for(const executor of [client,ownerPool]){
    const [identity]=(await executor.query(
      "SELECT current_setting('neon.project_id',true) AS project, current_setting('neon.branch_id',true) AS branch"
    )).rows;
    assert.equal(identity?.project,PROJECT,"Unexpected Neon project");
    assert.equal(identity?.branch,BRANCH,"Refusing non-test01 database");
  }
  const [who]=(await client.query("SELECT current_user AS role")).rows;
  assert.equal(who?.role,RESTRICTED_USER);

  await client.query("BEGIN");
  const observations=new Map();
  try {
    for(const statement of statements.slice(1,-1)){
      const result=await client.query(statement);
      for(const row of result.rows??[]){
        for(const [name,value] of Object.entries(row)){
          if(name.endsWith("_pass"))observations.set(name,value);
        }
      }
    }
    for(const field of ["author_scope_pass","reviewer_scope_pass","blueprint_planning_pass"])
      assert.equal(observations.get(field),true,field+" must be true");
  } finally {
    await client.query("ROLLBACK");
  }

  const [clean]=(await ownerPool.query(`
    SELECT
      (SELECT count(*)::integer FROM education_v30.blueprint_configurations
       WHERE id='fbab0000-0000-4000-8000-000000000001') AS configurations,
      (SELECT count(*)::integer FROM education_v30.blueprint_configuration_versions
       WHERE id='fbab0000-0000-4000-8000-000000000002') AS versions,
      (SELECT count(*)::integer FROM education_v30.configuration_reviews
       WHERE id='fbab0000-0000-4000-8000-000000000003') AS reviews,
      (SELECT count(*)::integer FROM education_v30.blueprint_execution_batches
       WHERE id='fbab0000-0000-4000-8000-000000000004') AS batches,
      (SELECT count(*)::integer FROM education_v30.program_deployments
       WHERE id='fbab0000-0000-4000-8000-000000000005') AS deployments
  `)).rows;
  for(const [key,count] of Object.entries(clean??{}))
    assert.equal(count,0,key+" must be rolled back");

  console.log(JSON.stringify({
    result:"PASS",branch:BRANCH,restrictedRole:RESTRICTED_USER,
    assertions:Object.fromEntries(observations),
    fixtureCleanup:clean,
    actualSignedInBrowserTest:false,
  },null,2));
} finally {
  client?.release();
  await appPool.end();
  await ownerPool.end();
}

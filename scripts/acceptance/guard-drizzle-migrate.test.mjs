import { test } from "node:test";
import assert from "node:assert/strict";
import { assertDisposableMigrationIntent, assertVerifiedMigrationTarget,
  PRODUCTION_NEON_BRANCH } from "../lib/migration-target-policy.mjs";

const url = "postgresql://test-user:test-secret@ep-disposable.us-east-2.aws.neon.tech/testdb?sslmode=require";
const env = {
  CAN_MIGRATION_ENV:"disposable",
  CAN_MIGRATION_EXPECTED_PROJECT_ID:"sample-project-12345",
  CAN_MIGRATION_EXPECTED_BRANCH_ID:"br-disposable-test-123",
  CAN_MIGRATION_EXPECTED_DATABASE:"testdb",
  CAN_MIGRATION_EXPECTED_JOURNAL_TIP:"101",
  CAN_MIGRATION_APPROVAL:"DISPOSABLE_ONLY:br-disposable-test-123:101",
};
test("no accidental migration without explicit disposable intent",()=>{
  for(const key of Object.keys(env)) {
    const missing={...env};delete missing[key];
    assert.throws(()=>assertDisposableMigrationIntent(missing,url,101));
  }
  assert.throws(()=>assertDisposableMigrationIntent({...env,CAN_MIGRATION_ENV:"production"},url,101));
  assert.throws(()=>assertDisposableMigrationIntent(env,undefined,101));
  assert.throws(()=>assertDisposableMigrationIntent(env,"postgresql://localhost/testdb",101));
  assert.throws(()=>assertDisposableMigrationIntent(env,url,100));
});
test("production main is always denied even with an explicit approval string",()=>{
 const prod={...env,CAN_MIGRATION_EXPECTED_BRANCH_ID:PRODUCTION_NEON_BRANCH,
   CAN_MIGRATION_APPROVAL:"DISPOSABLE_ONLY:"+PRODUCTION_NEON_BRANCH+":101"};
 assert.throws(()=>assertDisposableMigrationIntent(prod,url,101),/production main/);
});
test("live database attestation must match all explicitly approved identifiers",()=>{
 const approved=assertDisposableMigrationIntent(env,url,101);
 const actual={project_id:approved.projectId,branch_id:approved.branchId,
   database_name:approved.databaseName};
 assert.equal(assertVerifiedMigrationTarget(approved,actual),true);
 for(const field of Object.keys(actual))
   assert.throws(()=>assertVerifiedMigrationTarget(approved,{...actual,[field]:"other"}));
 assert.throws(()=>assertVerifiedMigrationTarget(approved,null));
});

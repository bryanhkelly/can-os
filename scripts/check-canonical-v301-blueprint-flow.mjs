#!/usr/bin/env node
// Purpose-bound PostgreSQL acceptance of the NEW canonical Blueprint workflow.
// Requires disposable native demo data, published starter recipes, and roles.
// All writes are rolled back; no production application DB may be used.
import { randomUUID } from "node:crypto";
import { Pool } from "@neondatabase/serverless";
import { assertIsolatedTestDatabaseTarget, endpoint } from "./isolated-test-db-guard.mjs";

function fail(message) { throw new Error("Canonical Blueprint acceptance: " + message); }
if (process.env.APP_ENV !== "test") fail("APP_ENV=test is required");
const { testUrl } = assertIsolatedTestDatabaseTarget({ env: process.env, fail });
const appUrl = process.env.CAN_CANONICAL_TEST_APP_DATABASE_URL;
if (!appUrl) fail("CAN_CANONICAL_TEST_APP_DATABASE_URL must be a restricted test login");
const owner = new URL(testUrl), app = new URL(appUrl);
if (endpoint(testUrl, fail) !== endpoint(appUrl, fail) ||
    owner.pathname !== app.pathname || owner.port !== app.port ||
    owner.username === app.username) {
  fail("restricted login must use the SAME isolated database, but a different account");
}

const org = "11110000-0000-4000-8000-000000000001";
const site = "22220000-0000-4000-8000-000000000001";
const operation = "88880000-0000-4000-8000-000000000001";
const author = "44440000-0000-4000-8000-000000000001";
const reviewer = "44440000-0000-4000-8000-000000000003";
const evidence = "bbbb0000-0000-4000-8000-000000000001";
const offering = "cccc0000-0000-4000-8000-000000000001";
const offeringVersion = "cccc0000-0000-4000-8000-000000000002";
const suffix = org.replaceAll("-", "");
const authorRole = "can_v30_blueprint_author_" + suffix;
const reviewerRole = "can_v30_blueprint_reviewer_" + suffix;
const ids = {
  configuration: randomUUID(), version: randomUUID(), review: randomUUID(),
  batch: randomUUID(), deployment: randomUUID(),
};
function check(condition, message) { if (!condition) fail(message); }

const pool = new Pool({ connectionString: appUrl, max: 1 });
const client = await pool.connect();
const q = (statement, args = []) => client.query(statement, args);
async function expectPermissionDenied(statement, args) {
  await q("SAVEPOINT expected_denial");
  let denied = false;
  try { await q(statement, args); }
  catch (err) { if (err.code !== "42501") throw err; denied = true; }
  finally {
    await q("ROLLBACK TO SAVEPOINT expected_denial");
    await q("RELEASE SAVEPOINT expected_denial");
  }
  check(denied, "A prohibited cross-role write was allowed");
}
let started = false;
try {
  await q("BEGIN");
  started = true;
  await q("SET LOCAL ROLE " + authorRole);
  const currentRole = (await q("SELECT current_user AS role")).rows[0].role;
  check(currentRole === authorRole, "Author role not established");
  const ownSite = await q("SELECT id FROM education_v30.sites WHERE id=$1", [site]);
  const siblingSite = await q("SELECT id FROM education_v30.sites WHERE id=$1",
    ["22220000-0000-4000-8000-000000000002"]);
  check(ownSite.rowCount === 1 && siblingSite.rowCount === 0, "Site RLS isolation failed");

  const recipe = (await q(
    "SELECT b.id AS blueprint_id,v.id AS recipe_id,c.id AS component_id " +
    "FROM education_v30.blueprints b " +
    "JOIN education_v30.blueprint_versions v ON v.blueprint_id=b.id " +
    "JOIN education_v30.blueprint_components c ON c.blueprint_version_id=v.id " +
    "WHERE b.code='can.school.starter' AND v.lifecycle='published' " +
    "AND c.component_key='academic_programs'"
  )).rows;
  check(recipe.length === 1, "School starter recipe must be published");
  const bp = recipe[0];

  await q("INSERT INTO education_v30.blueprint_configurations " +
    "(id,blueprint_id,owning_organization_id,name) VALUES($1,$2,$3,'Acceptance plan')",
    [ids.configuration, bp.blueprint_id, org]);
  await q("INSERT INTO education_v30.blueprint_configuration_versions " +
    "(id,configuration_id,blueprint_id,blueprint_version_id,revision,config,lifecycle) " +
    "VALUES($1,$2,$3,$4,1,jsonb_build_object('siteId',$5::text),'draft')",
    [ids.version, ids.configuration, bp.blueprint_id, bp.recipe_id, site]);
  await q("INSERT INTO education_v30.blueprint_configuration_components " +
    "(configuration_version_id,blueprint_version_id,component_id,selection_status) " +
    "VALUES($1,$2,$3,'selected')", [ids.version, bp.recipe_id, bp.component_id]);
  await q("INSERT INTO education_v30.blueprint_configuration_offering_intents " +
    "(configuration_version_id,component_id,offering_version_id) " +
    "VALUES($1,$2,$3)", [ids.version, bp.component_id, offeringVersion]);
  await q("INSERT INTO education_v30.audit_events " +
    "(actor_person_id,owning_organization_id,event_code,entity_kind,entity_id,payload) " +
    "VALUES($1,$2,'blueprint.configuration.submitted','blueprint_configuration',$3," +
    "jsonb_build_object('versionId',$4::text))",
    [author, org, ids.configuration, ids.version]);
  await q("UPDATE education_v30.blueprint_configuration_versions " +
    "SET lifecycle='frozen',frozen_at=clock_timestamp() WHERE id=$1", [ids.version]);

  await q("SET LOCAL ROLE " + reviewerRole);
  const verified = await q("SELECT id FROM education_v30.evidence_document_versions WHERE id=$1",
    [evidence]);
  const siblingEvidence = await q("SELECT id FROM education_v30.evidence_documents " +
    "WHERE owning_organization_id=$1", ["11110000-0000-4000-8000-000000000002"]);
  check(verified.rowCount === 1 && siblingEvidence.rowCount === 0,
    "Reviewer evidence scope failed");
  await expectPermissionDenied(
    "INSERT INTO education_v30.blueprint_configurations " +
    "(id,blueprint_id,owning_organization_id,name) VALUES($1,$2,$3,'Prohibited')",
    [randomUUID(), bp.blueprint_id, org]);
  await q("INSERT INTO education_v30.blueprint_component_approval_decisions " +
    "(configuration_version_id,component_id,decision,reviewer_person_id," +
    "authority_organization_id,evidence_version_id) VALUES($1,$2,'approved',$3,$4,$5)",
    [ids.version, bp.component_id, reviewer, org, evidence]);
  await q("INSERT INTO education_v30.configuration_reviews " +
    "(id,configuration_version_id,reviewer_person_id,decision,evidence_version_id) " +
    "VALUES($1,$2,$3,'approved',$4)", [ids.review, ids.version, reviewer, evidence]);

  await q("SET LOCAL ROLE " + authorRole);
  await expectPermissionDenied("INSERT INTO education_v30.configuration_reviews " +
    "(id,configuration_version_id,reviewer_person_id,decision,evidence_version_id) " +
    "VALUES($1,$2,$3,'approved',$4)", [randomUUID(), ids.version, author, evidence]);
  await q("INSERT INTO education_v30.blueprint_execution_batches " +
    "(id,configuration_version_id,blueprint_version_id,review_id,idempotency_key," +
    "executing_organization_id) VALUES($1,$2,$3,$4,$5,$6)",
    [ids.batch, ids.version, bp.recipe_id, ids.review, "acceptance:" + ids.version, org]);
  await q("UPDATE education_v30.blueprint_execution_batches " +
    "SET execution_status='executed',executed_by_person_id=$2,executed_at=clock_timestamp() " +
    "WHERE id=$1", [ids.batch, author]);
  await q("INSERT INTO education_v30.blueprint_outputs " +
    "(blueprint_version_id,execution_batch_id,configuration_version_id,review_id,operation_id) " +
    "VALUES($1,$2,$3,$4,$5)", [bp.recipe_id, ids.batch, ids.version, ids.review, operation]);
  await q("INSERT INTO education_v30.program_deployments " +
    "(id,operation_id,offering_id,code,name,status) " +
    "VALUES($1,$2,$3,$4,'Digital Skills Foundations (demo)','planning')",
    [ids.deployment, operation, offering,
      "acceptance-" + ids.version.replaceAll("-", "")]);
  await q("INSERT INTO education_v30.deployment_offering_adoptions " +
    "(deployment_id,offering_id,offering_version_id,valid_from,approval_status) " +
    "VALUES($1,$2,$3,clock_timestamp(),'proposed')",
    [ids.deployment, offering, offeringVersion]);
  await q("INSERT INTO education_v30.blueprint_outputs " +
    "(blueprint_version_id,execution_batch_id,configuration_version_id,review_id,deployment_id) " +
    "VALUES($1,$2,$3,$4,$5)",
    [bp.recipe_id, ids.batch, ids.version, ids.review, ids.deployment]);
  const deployment = (await q(
    "SELECT p.status,a.approval_status FROM education_v30.program_deployments p " +
    "JOIN education_v30.deployment_offering_adoptions a ON a.deployment_id=p.id " +
    "WHERE p.id=$1", [ids.deployment])).rows;
  check(deployment.length === 1 && deployment[0].status === "planning" &&
    deployment[0].approval_status === "proposed",
    "Execution must only create a proposed, planning-only Deployment");
  console.log("PASS: canonical draft -> submit -> independent review -> planning Deployment");
  console.log("PASS: tenant isolation, reviewer separation, non-activation");
} catch (error) {
  console.error("Canonical Blueprint acceptance failed:",
    error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  try { if (started) await q("ROLLBACK"); }
  finally { client.release(); await pool.end(); }
}

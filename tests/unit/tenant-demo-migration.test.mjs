import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assessTenantDemoColumnRemoval, assessPost0051MigrationArtifacts } from "../../scripts/fullflow-post0051-artifacts.mjs";

const columns=[{column_name:"is_synthetic",data_type:"boolean",is_nullable:"NO"}];
describe("0060 tenant identity migration",()=>{
 it("recognizes PostgreSQL's truncated 0056 FK name without accepting a missing constraint",()=>{
  const state={stage:57,tables:[],relationshipColumns:[],futureIndexes:[],cohortColumns:[],
   cohortConstraints:[{conname:"graduation_requirement_sets_supersedes_requirement_set_id_gradu"}]};
  expect(assessPost0051MigrationArtifacts(state).some(issue=>issue.includes("id_fk"))).toBe(false);
  expect(assessPost0051MigrationArtifacts({...state,cohortConstraints:[]})
   .some(issue=>issue.includes("id_fk"))).toBe(true);
 });
 it("drops only the obsolete grant column and preserves historical snapshot ancestry",()=>{
  expect(readFileSync("drizzle/0060_tenant_demo_access.sql","utf8").trim())
   .toBe('ALTER TABLE "account_person_grants" DROP COLUMN "is_synthetic";');
  const previous=JSON.parse(readFileSync("drizzle/meta/0059_snapshot.json","utf8"));
  const next=JSON.parse(readFileSync("drizzle/meta/0060_snapshot.json","utf8"));
  expect(next.prevId).toBe(previous.id);
  expect(previous.tables["public.account_person_grants"].columns).toHaveProperty("is_synthetic");
  expect(next.tables["public.account_person_grants"].columns).not.toHaveProperty("is_synthetic");
 });
 it("requires the known column before DDL and its absence after the exact ledger stage",()=>{
  expect(assessTenantDemoColumnRemoval({stage:60,accountGrantColumns:columns})).toEqual([]);
  expect(assessTenantDemoColumnRemoval({stage:61,accountGrantColumns:[]})).toEqual([]);
  expect(assessTenantDemoColumnRemoval({stage:60,accountGrantColumns:[]})[0]).toContain("ahead");
  expect(assessTenantDemoColumnRemoval({stage:61,accountGrantColumns:columns})[0]).toContain("after");
  expect(assessTenantDemoColumnRemoval({stage:60,accountGrantColumns:[
   {...columns[0],is_nullable:"YES"},
  ]})[0]).toContain("definition changed");
 });
});

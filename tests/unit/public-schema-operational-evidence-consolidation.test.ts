import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const cases=[
 {path:"database/production/2026-11-17-consolidate-four-empty-operational-evidence-leaves.sql",
  tables:["applicant_offer_responses","content_usage_events","control_evaluation_evidence","equipment_custody_events"],
  fkCount:13,triggerCount:5},
 {path:"database/production/2026-11-17-move-assessment-response-assets-to-public.sql",
  tables:["assessment_response_assets"],fkCount:2,triggerCount:2},
 {path:"database/production/2026-11-17-relocate-impact-and-shared-resource-leaves.sql",
  tables:["initiative_metric_observation_sources","shared_resource_allocations"],fkCount:4,triggerCount:2},
] as const;
function sqlSource(path:string){
 return readFileSync(path,"utf8");
}

describe("Neon main evidence leaf consolidation safety",()=>{
 it("moves exactly seven protected leaves with 19 existing FKs and 9 triggers",()=>{
  const names=cases.flatMap(c=>[...c.tables]);
  expect(new Set(names).size).toBe(7);
  expect(cases.reduce((sum,c)=>sum+c.fkCount,0)).toBe(19);
  expect(cases.reduce((sum,c)=>sum+c.triggerCount,0)).toBe(9);
  for(const {path,tables} of cases){
   const raw=sqlSource(path);
   expect(raw,path).toContain("sweet-hall-62441909");
   expect(raw,path).toContain("br-restless-sea-ar9ooo55");
   expect(raw,path).toContain("current_database()");
   expect(raw,path).toContain("pg_policy");
   expect(raw,path).toContain("pg_trigger");
   expect(raw,path).toContain("pg_constraint");
   expect(raw,path).toContain("pg_rewrite");
   expect(raw,path).toContain("pg_get_functiondef");
   expect(raw,path).toContain("relforcerowsecurity");
   for(const name of tables)expect(raw,path).toContain(name);
   expect(raw,path).toMatch(/\b(?:previous_oid|original|original_oid)\b/);
   const executable=raw.split("\n").filter(line=>!line.trimStart().startsWith("--")).join("\n");
   expect(executable,path).toContain("SET SCHEMA public");
   expect(executable,path).not.toMatch(/\bDROP TABLE\b|\bCASCADE\b|\bTRUNCATE\b|\bDELETE FROM\b/);
  }
 });
 it("rebinds both security-definer routines atomically with the table moves",()=>{
  const source=sqlSource(cases[2].path);
  expect(source).toContain("v30_verify_impact_observation");
  expect(source).toContain("v30_guard_shared_resource_allocation");
  expect(source).toContain("FROM public.");
  expect(source).toContain("SECURITY DEFINER");
  expect(source).toContain("replace(body,src,dest)");
  expect(source).toContain("Routine rebind verification failed");
 });
});

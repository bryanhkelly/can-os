import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const read=(name:string)=>readFileSync(new URL("../../"+name,import.meta.url),"utf8");
const files=[
 "database/production/2026-11-17-consolidate-feedback-categories.sql",
 "database/production/2026-11-17-consolidate-static-reference-tables.sql",
 "database/production/2026-11-17-consolidate-36-empty-legacy-tables.sql",
];
describe("public-schema production consolidation safety",()=>{
 it("migrations move objects in place, never replicate identities or lose rows",()=>{
  const names:string[]=[];
  for(const file of files){
   const source=read(file);
   expect(source).toContain("br-restless-sea-ar9ooo55");
   expect(source).toContain("SET LOCAL lock_timeout");
   expect(source).toContain("BEGIN;");
   expect(source).toContain("COMMIT;");
   expect(source).not.toMatch(/\bCREATE TABLE\b|\bDROP TABLE\b|\bINSERT INTO\b|\bDELETE FROM\b/i);
   for(const match of source.matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm))
    names.push(match[1]);
  }
  expect(new Set(names).size).toBe(names.length);
  expect(names).toHaveLength(43);
 });
 it("read-only verifier extracts the same exact migration table names",()=>{
  const check=read("scripts/acceptance/check-public-schema-consolidation.mjs");
  for(const file of files)expect(check).toContain(file);
  expect(check).toContain('CAN_SCHEMA_CONSOLIDATION_CHECK!=="1"');
  expect(check).toContain('target?.branch!=="br-restless-sea-ar9ooo55"');
  expect(check).toContain("canonical_present");
  expect(check).toContain("fkReferencesToMovedTables");
  expect(check).not.toMatch(/sql\`\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|TRUNCATE)\b/i);
 });
});

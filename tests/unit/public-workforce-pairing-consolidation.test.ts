import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(name:string)=>readFileSync(name,"utf8");

describe("Neon main public-schema consolidation safety",()=>{
 it("retains governed workforce earning evidence through an in-place OID move",()=>{
  const sql=read("database/production/2026-11-17-move-native-workforce-earning-events-to-public.sql");
  expect(sql).toContain("br-restless-sea-ar9ooo55");
  expect(sql).toContain("ALTER TABLE education_v30.workforce_earning_events SET SCHEMA public");
  expect(sql).toContain("original_oid");
  expect(sql).toContain("c.relforcerowsecurity");
  expect(sql).toContain("pg_policy");
  expect(sql).toContain("pg_trigger");
  expect(sql).toContain("pg_constraint");
  expect(sql).toContain("pg_get_functiondef");
  expect(sql).not.toContain("DROP TABLE");
  expect(sql).not.toContain("CASCADE");
  expect(sql).not.toContain("INSERT INTO");
 });

 it("pairing limiter migration is idempotent and old-runtime cutover remains gated",()=>{
  const sql=read("database/production/2026-11-17-stage-pairing-rate-limit-public-relocation.sql");
  expect(sql).toContain("can.pairing_public_runtime_verified");
  expect(sql).toContain("Pairing limiter already consolidated to public");
  expect(sql).toContain("ALTER TABLE education_v30.facilitated_pairing_rate_limits SET SCHEMA public");
  expect(sql).toContain("relforcerowsecurity");
  expect(sql).toContain("pg_index");
  expect(sql).toContain("source_oid");
  expect(sql).not.toContain("DROP TABLE");
  expect(sql).not.toContain("CASCADE");
  expect(sql).not.toContain("INSERT INTO");
  // The canonical table mapping now uses the authoritative public table.
  const owner=read("src/db/canonical-v301/facilitated-learning.ts");
  expect(owner).toContain('facilitatedPairingRateLimits = pgTable("facilitated_pairing_rate_limits"');
 });
});

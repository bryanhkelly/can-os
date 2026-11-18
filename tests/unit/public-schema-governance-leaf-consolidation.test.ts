import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read=(file:string)=>readFileSync(file,"utf8");
const migrations=[
  {
    path:"database/production/2026-11-17-consolidate-five-protected-governance-leaves.sql",
    names:[
      "funding_eligibility_evaluations","network_governance_delegations",
      "qualification_readiness_review_links","quality_reassessments",
      "site_requirement_evaluations",
    ],
    foreignKeys:21,
  },
  {
    path:"database/production/2026-11-17-consolidate-five-empty-governance-privacy-tables.sql",
    names:[
      "assurance_case_events","feedback_subjects",
      "governance_policy_adoptions","governance_policy_scopes",
      "learner_data_disclosures",
    ],
    foreignKeys:33,
  },
] as const;

describe("main-only retirement of protected education_v30 leaf tables",()=>{
  it("migrates exactly ten reviewed tables with atomic per-statement OID preservation",()=>{
    const allNames=migrations.flatMap(m=>[...m.names]);
    expect(new Set(allNames).size).toBe(10);
    expect(migrations.reduce((n,m)=>n+m.foreignKeys,0)).toBe(54);
    for(const migration of migrations){
      const source=read(migration.path);
      expect(source).toContain("sweet-hall-62441909");
      expect(source).toContain("br-restless-sea-ar9ooo55");
      expect(source).toContain("current_database()");
      for(const name of migration.names)expect(source).toContain("'"+name+"'");
      expect(source).toContain("ALTER TABLE education_v30.%I SET SCHEMA public");
      expect(source).toContain("pg_policy");
      expect(source).toContain("pg_trigger");
      expect(source).toContain("pg_constraint");
      expect(source).toContain("pg_rewrite");
      expect(source).toContain("pg_get_functiondef");
      expect(source).toMatch(/source_oid|original_oid/);
      expect(source).not.toMatch(/\bDROP TABLE\b/);
      expect(source).not.toMatch(/\bCASCADE\b/);
      expect(source).not.toMatch(/\bTRUNCATE\b/);
      expect(source).not.toMatch(/\bINSERT INTO\b/);
      expect(source).not.toMatch(/\bUPDATE public\./);
    }
  });
  it("denies cross-tenant, unreviewed dependencies and populated tables",()=>{
    const first=read(migrations[0].path);
    const second=read(migrations[1].path);
    expect(first).toContain("row_count<>0");
    expect(second).toContain("row_count<>0");
    expect(first).toContain("Unexpected inbound FK, view, RLS or trigger");
    expect(second).toContain("Unexpected inbound FK, view, RLS or trigger");
    expect(first).toContain("Refusing to migrate outside CAN OS Neon MAIN");
    expect(second).toContain("CAN OS Neon main database is required");
    expect(first).toContain("to_regclass('public.'||item.name)");
    expect(second).toContain("to_regclass('public.'||target.name)");
  });
});

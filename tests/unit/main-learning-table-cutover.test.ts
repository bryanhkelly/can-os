import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
const cases=[
  ["guardian_authorities","src/db/canonical-v301/learning.ts","guardianAuthorities"],
  ["learner_unit_progress","src/db/canonical-v301/learning.ts","learnerUnitProgress"],
  ["enrollment_prospect_interests","src/db/canonical-v301/public-planning.ts","enrollmentProspectInterests"],
  ["facilitated_pairing_rate_limits","src/db/canonical-v301/facilitated-learning.ts","facilitatedPairingRateLimits"],
];

describe("production main learning table consolidation",()=>{
  it("maps the four original relations to public schema",()=>{
    const migration=read("database/production/2026-11-17-consolidate-four-empty-learning-tables.sql");
    for(const [table,path,model] of cases){
      const code=read(path);
      expect(code).toContain(model+" = pgTable(");
      expect(code).not.toContain(model+" = educationV30.table(");
      expect(migration).toContain("ALTER TABLE education_v30."+table+" SET SCHEMA public");
    }
  });
  it("keeps the cutover transactional, with forced RLS and no data deletion",()=>{
    const source=read("database/production/2026-11-17-consolidate-four-empty-learning-tables.sql");
    expect(source).toContain("relforcerowsecurity");
    expect(source).toContain("has_table_privilege('authenticated'");
    expect(source).toContain("COMMIT;");
    expect(source).not.toMatch(/\bDROP TABLE\b|\bDISABLE ROW LEVEL SECURITY\b|\bINSERT INTO\b/i);
  });
  it("retains a read-only main-only acceptance check",()=>{
    const gate=read("scripts/acceptance/check-main-learning-table-cutover.mjs");
    expect(gate).toContain("CAN_LEARNING_TABLE_CUTOVER_CHECK");
    expect(gate).toContain('MAIN="br-restless-sea-ar9ooo55"');
    expect(gate).toContain("verified:true");
    expect(gate).not.toMatch(/sql`\s*(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE)\b/i);
  });
});

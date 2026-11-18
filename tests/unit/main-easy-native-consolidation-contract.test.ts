import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
const plan=[
  ["equipment_ownership_periods","evaluation_basis_invalidations",
    "improvement_action_evidence","qualification_reassessment_requests"],
  ["deployment_operating_contexts","funding_award_eligible_deployments",
    "initiative_deployments"],
] as const;
const files=[
  "database/production/2026-11-17-consolidate-four-empty-native-capabilities.sql",
  "database/production/2026-11-17-consolidate-three-empty-operational-capabilities.sql",
];
describe("guarded main native-to-public easy migrations",()=>{
  it("moves original tables, never copies or destroys them",()=>{
    files.forEach((file,i)=>{
      const ddl=read(file);
      for(const name of plan[i]){
        expect(ddl).toContain("ALTER TABLE education_v30."+name+" SET SCHEMA public");
      }
      expect(ddl).toContain("c.relrowsecurity AND c.relforcerowsecurity");
      expect(ddl).toContain("CAN OS");
      expect(ddl).not.toMatch(/\bDROP\s+TABLE\b|\bCREATE\s+TABLE\b|\bINSERT\s+INTO\b/i);
    });
  });
  it("rebases native database routines without weakening the security boundary",()=>{
    const sql=files.map(read).join("\n");
    for(const name of [
      "v29_guard_subject","v30_evaluation_basis_is_current",
      "v27_verify_improvement","v29_queue_qualification_reassessment",
      "v28_require_youth_readiness","v292_program_activation_preflight",
      "v28_enforce_funding_attribution","v28_validate_funded_deployment_scope",
      "v28_register_noncredit",
    ]) expect(sql).toContain(name);
    expect(sql).not.toContain("DISABLE ROW LEVEL SECURITY");
  });
  it("keeps independent exact-main read-only acceptance",()=>{
    const gate=read("scripts/acceptance/check-main-easy-native-consolidation.mjs");
    expect(gate).toContain("CAN_MAIN_EASY_CONSOLIDATION_CHECK");
    expect(gate).toContain('const MAIN="br-restless-sea-ar9ooo55"');
    expect(gate).toContain("clientReadsDenied:true");
    expect(gate).toContain("forceRlsPreserved:true");
    expect(gate).not.toMatch(/sql`\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT)\b/i);
  });
});

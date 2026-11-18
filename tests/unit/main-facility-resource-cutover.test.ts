import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");

describe("Neon main facility, resource and professional service schema consolidation",()=>{
  it("moves four original guarded objects to public without copying or deleting evidence",()=>{
    const sql=read("database/production/2026-11-17-consolidate-four-facility-resource-evidence-tables.sql");
    for(const name of [
      "blueprint_facility_requirements",
      "site_space_capability_assertions",
      "shared_resource_pools",
      "professional_service_delivery_records",
    ])expect(sql).toContain("ALTER TABLE education_v30."+name+" SET SCHEMA public");
    expect(sql).toContain("relforcerowsecurity");
    expect(sql).not.toMatch(/^\s*(?:DROP|DELETE|TRUNCATE|GRANT|REVOKE)\b/im);
  });

  it("recompiles six existing dependent functions within the guarded transaction",()=>{
    const sql=read("database/production/2026-11-17-consolidate-four-facility-resource-evidence-tables.sql");
    for(const name of [
      "v27_check_facility_requirement","v27_check_facility_verification",
      "v292_guard_fit_requirement_result","v29_guard_evaluation_facility",
      "v30_guard_shared_resource_allocation","validate_workforce_earning",
    ])expect(sql).toContain(name);
    expect(sql).toContain("EXECUTE statement;");
    expect(sql).toContain("COMMIT;");
  });

  it("enforces schema, RLS and foreign keys in a main-only read acceptance",()=>{
    const check=read("scripts/acceptance/check-main-facility-resource-cutover.mjs");
    expect(check).toContain('MAIN="br-restless-sea-ar9ooo55"');
    expect(check).toContain("CAN_MAIN_FACILITY_RESOURCE_CHECK");
    expect(check).toContain("functionsChecked:functions.length");
    expect(check).not.toMatch(/sql`\s*(?:UPDATE|INSERT|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
  });
});

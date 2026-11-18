import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");

describe("CAN OS public-schema consolidation",()=>{
  it("retains both Site device capabilities in public while preserving existing RLS",()=>{
    const source=read("src/db/canonical-v301/device-operations.ts");
    const migration=read("database/production/2026-11-17-consolidate-device-scope-tables.sql");
    const parity=read("scripts/acceptance/check-production-drizzle-parity.mjs");
    expect(source).toContain('siteDeviceRegistrations=pgTable("site_device_registrations"');
    expect(source).toContain('siteDevicePolicies=pgTable("site_device_policies"');
    expect(source).not.toContain('educationV30.table("site_device_');
    expect(migration).toContain("ALTER TABLE education_v30.site_device_policies SET SCHEMA public");
    expect(migration).toContain("ALTER TABLE education_v30.site_device_registrations SET SCHEMA public");
    expect(migration).toContain("AND c.relrowsecurity AND NOT c.relforcerowsecurity");
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b|\bCREATE\s+TABLE\b|\bINSERT\s+INTO\b/i);
    expect(parity).toContain("to_regclass('public.site_device_policies')");
    expect(parity).toContain("to_regclass('public.site_device_registrations')");
  });

  it("relocates three empty governance tables with all four dependent SQL routines",()=>{
    const migration=read("database/production/2026-11-17-consolidate-three-empty-gov-tables.sql");
    for(const table of [
      "framework_competency_reuse_authorizations",
      "network_memberships",
      "official_authorization_scopes",
    ]) expect(migration).toContain("ALTER TABLE education_v30."+table+" SET SCHEMA public");
    for(const functionName of [
      "v26_validate_framework_membership",
      "v28_check_network_delegation",
      "v26_check_placement_authorization",
      "v27_check_credential_support",
    ]) expect(migration).toContain("CREATE OR REPLACE FUNCTION education_v30."+functionName);
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b|\bCREATE\s+TABLE\b|\bINSERT\s+INTO\b/i);
  });

  it("never deletes a real admission offer when retiring an unused native duplicate",()=>{
    const migration=read("database/production/2026-11-17-retire-unused-native-admission-offers.sql");
    expect(migration).toContain("to_regclass('public.admission_offers')");
    expect(migration).toContain("to_regclass('education_v30.admission_offers') IS NULL");
    expect(migration).toContain("DROP TABLE education_v30.admission_offers RESTRICT");
    expect(migration).toContain("Refusing deletion");
    expect(migration).not.toContain("CASCADE");
  });
});

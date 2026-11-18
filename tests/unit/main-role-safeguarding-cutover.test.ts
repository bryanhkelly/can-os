import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");

describe("production main authorization and safeguarding schema consolidation",()=>{
  it("moves original secured tables without destructive DDL or privilege broadening",()=>{
    const ddl=[
      "database/production/2026-11-17-consolidate-role-organization-bindings.sql",
      "database/production/2026-11-17-consolidate-safeguarding-triage.sql",
    ].map(read).join("\n");
    expect(ddl).toContain("ALTER TABLE education_v30.database_role_organization_bindings SET SCHEMA public");
    expect(ddl).toContain("ALTER TABLE education_v30.safeguarding_triage_queue SET SCHEMA public");
    expect(ddl).toContain("relforcerowsecurity");
    expect(ddl).toContain("has_table_privilege('authenticated'");
    expect(ddl).not.toMatch(/^\s*(?:DROP|DELETE|TRUNCATE|GRANT|REVOKE)\b/im);
  });

  it("keeps role purpose checks and all existing trigger handlers intact",()=>{
    const role=read("database/production/2026-11-17-consolidate-role-organization-bindings.sql");
    const safety=read("database/production/2026-11-17-consolidate-safeguarding-triage.sql");
    expect(role).toContain("v28_role_can_access_org");
    expect(role).toContain("v28_role_has_purpose");
    expect(role).toContain("FROM public.database_role_organization_bindings b");
    expect(safety).toContain("v27_open_safeguarding_case_triage");
    expect(safety).toContain("v27_open_safety_feedback_triage");
    expect(safety).toContain("v28_triage_feedback_reclassified");
    expect(safety).toContain("INSERT INTO public.safeguarding_triage_queue(");
    expect(safety).toContain("pg_trigger");
  });

  it("updates real provisioning and operator acceptance readers",()=>{
    for(const path of [
      "database/canonical/v3.0.1/provision-program-catalog-role.sql",
      "database/canonical/v3.0.1/provision-survey-draft-author-role.sql",
      "database/canonical/v3.0.1/provision-canonical-assessment-draft-role.sql",
      "database/canonical/v3.0.1/provision-survey-review-publication-roles.sql",
      "database/canonical/v3.0.1/provision-canonical-assessment-approval-roles.sql",
      "database/canonical/v3.0.1/provision-blueprint-roles.sql",
      "database/canonical/v3.0.1/verify-survey-draft-author-role.sql",
      "database/canonical/v3.0.1/verify-survey-review-publication-roles.sql",
      "scripts/acceptance/check-canonical-objective-draft-preflight.mjs",
      "scripts/acceptance/check-canonical-objective-approval-preflight.mjs",
      "scripts/check-canonical-v301-ddl.mjs",
    ]){
      expect(read(path)).toContain("public.database_role_organization_bindings");
      expect(read(path)).not.toContain("education_v30.database_role_organization_bindings");
    }
  });

  it("provides main-only read-only verification and denies unapproved scopes",()=>{
    const gate=read("scripts/acceptance/check-main-role-and-safeguarding-cutover.mjs");
    expect(gate).toContain("CAN_MAIN_AUTH_SAFETY_CHECK");
    expect(gate).toContain('MAIN="br-restless-sea-ar9ooo55"');
    expect(gate).toContain("unauthorizedAccessDenied:true");
    expect(gate).toContain("originalSecurityFunctions:funcs.length");
    expect(gate).not.toMatch(/sql`\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE)\b/im);
  });
});

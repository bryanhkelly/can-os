import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");

describe("single authoritative public authentication table security",()=>{
  it("enforces forced RLS and client deny on current CAN accounts, sessions and grants",()=>{
    const ddl=read("database/production/2026-11-17-harden-shared-auth-rls.sql");
    for(const table of ["access_accounts","access_sessions","account_person_grants"]){
      expect(ddl).toContain("ALTER TABLE public."+table+" ENABLE ROW LEVEL SECURITY");
      expect(ddl).toContain("ALTER TABLE public."+table+" FORCE ROW LEVEL SECURITY");
      expect(ddl).toContain("REVOKE ALL PRIVILEGES ON TABLE public."+table);
      expect(ddl).toContain("CREATE POLICY "+table+"_deny_direct_client");
    }
    expect(ddl).not.toMatch(/^\s*(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/im);
  });

  it("does not weaken existing protected links and independently reviewed adult evidence",()=>{
    const ddl=read("database/production/2026-11-17-revoke-shared-identity-metadata-client-acl.sql");
    for(const table of [
      "access_account_canonical_principals",
      "access_account_noncredit_principals",
      "access_adult_learning_reviews",
    ]) expect(ddl).toContain("REVOKE ALL PRIVILEGES ON TABLE public."+table);
    expect(ddl).toContain("c.relrowsecurity AND c.relforcerowsecurity");
    expect(ddl).toContain("pg_get_expr(p.polqual,p.polrelid)='true'");
    expect(ddl).not.toMatch(/^\s*(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT|GRANT)\b/im);
  });

  it("keeps exact-main read-only acceptance including negative staff-session check",()=>{
    const check=read("scripts/acceptance/check-main-shared-auth-rls.mjs");
    expect(check).toContain('MAIN="br-restless-sea-ar9ooo55"');
    expect(check).toContain("CAN_MAIN_SHARED_AUTH_RLS_CHECK");
    expect(check).toContain("v301_can_staff_session_context");
    expect(check).toContain("canonicalSessionRetired:false");
    expect(check).not.toMatch(/sql`\s*(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|GRANT|REVOKE)\b/i);
  });
});

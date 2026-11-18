import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");

describe("Neon main identity-protected table consolidation",()=>{
  const migration="database/production/2026-11-17-consolidate-learner-login-and-qualification-consent.sql";
  it("retains existing table identity, access restrictions and security-definer semantics",()=>{
    const sql=read(migration);
    for(const table of [
      "instructional_learner_login_bindings",
      "qualification_person_consent_withdrawals",
    ]) expect(sql).toContain("ALTER TABLE education_v30."+table+" SET SCHEMA public");
    expect(sql).toContain("relforcerowsecurity");
    expect(sql).toContain("p.prosecdef");
    expect(sql).toContain("EXECUTE updated;");
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b|\bCREATE\s+TABLE\b|\bINSERT\s+INTO\b|\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i);
  });

  it("updates existing learner role provisioning without introducing new grants",()=>{
    const provision=read("database/canonical/v3.0.1/provision-recorded-learner-role.sql");
    expect(provision).toContain("INSERT INTO public.instructional_learner_login_bindings");
    expect(provision).toContain("FROM public.instructional_learner_login_bindings b");
    expect(provision).not.toContain("education_v30.instructional_learner_login_bindings");
    expect(provision).toContain("course_attempt_id");
  });

  it("provides a main-only, read-only negative authorization acceptance check",()=>{
    const gate=read("scripts/acceptance/check-main-protected-identity-table-cutover.mjs");
    expect(gate).toContain("CAN_MAIN_PROTECTED_IDENTITY_CHECK");
    expect(gate).toContain('MAIN="br-restless-sea-ar9ooo55"');
    expect(gate).toContain("invalidAttemptDenied:true");
    expect(gate).toContain("securityDefinerFunctions:functions.length");
    expect(gate).not.toMatch(/sql`\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT)\b/i);
  });
});

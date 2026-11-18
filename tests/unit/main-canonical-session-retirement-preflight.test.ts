import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");

describe("main canonical session retirement safety",()=>{
  it("blocks retirement while native login, reader or revocation paths remain",()=>{
    const gate=read("scripts/acceptance/check-main-canonical-session-retirement.mjs");
    for(const marker of [
      "nativeSessionModel","nativeSessionIssuer","nativeIdentityCreator",
      "nativeSessionReader","nativeCookieContext","nativeSessionRevoker",
    ])expect(gate).toContain(marker);
    expect(gate).toContain("native_session_and_identity_runtime_paths_remain");
    expect(gate).toContain("native_identity_database_routines_remain");
    expect(gate).toContain("native_identity_foreign_keys_remain");
    expect(gate).toContain("retirementReady:blockers.length===0");
    expect(gate).toContain("process.exitCode=2");
  });

  it("checks production main and never touches credentials or operational data",()=>{
    const gate=read("scripts/acceptance/check-main-canonical-session-retirement.mjs");
    expect(gate).toContain('MAIN="br-restless-sea-ar9ooo55"');
    expect(gate).toContain("CAN_MAIN_CANONICAL_SESSION_RETIREMENT_CHECK");
    expect(gate).toContain("readOnly:true");
    expect(gate).not.toMatch(/sql`\s*(?:UPDATE|INSERT|DELETE|CREATE|DROP|ALTER|TRUNCATE|GRANT|REVOKE)\b/i);
  });

  it("requires full identity and authorization convergence, not zero session rows",()=>{
    const gate=read("scripts/acceptance/check-main-canonical-session-retirement.mjs");
    expect(gate).toContain("education_v30.canonical_sessions");
    expect(gate).toContain("education_v30.canonical_accounts");
    expect(gate).toContain("education_v30.canonical_account_grants");
    expect(gate).toContain("education_v30.persons");
    expect(gate).toContain("account_person_grants");
    expect(gate).toContain("relforcerowsecurity");
    expect(gate).toContain("pg_constraint");
    expect(gate).toContain("pg_get_functiondef");
  });
});

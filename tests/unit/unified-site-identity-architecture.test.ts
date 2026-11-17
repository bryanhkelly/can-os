import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path:string){
  return readFileSync(new URL("../../"+path,import.meta.url),"utf8");
}

describe("one authoritative Site identity migration contract",()=>{
  it("uses platform Site IDs for education extensions without a second Site identity",()=>{
    const ddl=read("database/canonical/v3.0.1/patch-unified-site-profile-preparation.sql");
    expect(ddl).toContain("site_id uuid PRIMARY KEY REFERENCES public.sites(id)");
    expect(ddl).toContain("ALTER TABLE education_v30.site_profiles FORCE ROW LEVEL SECURITY");
    expect(ddl).toContain("REVOKE ALL ON education_v30.site_profiles FROM PUBLIC");
    expect(ddl).not.toMatch(/\bCREATE TABLE\s+(?:IF NOT EXISTS\s+)?education_v30\.sites\b/i);
    expect(ddl).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(ddl).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(ddl).not.toMatch(/\bUPDATE\s+\w+\.sites\b/i);
  });

  it("fails closed on unverified QA environments and never mutates identity data",()=>{
    const preflight=read("scripts/acceptance/check-unified-site-identity.mjs");
    expect(preflight).toContain('env.APP_ENV!=="test"');
    expect(preflight).toContain('env.CAN_SITE_IDENTITY_PREFLIGHT!=="1"');
    expect(preflight).toContain("verifyAdmissionsNeonBranch");
    expect(preflight).toContain('process.exitCode=2');
    expect(preflight).toContain("Never reconcile by matching names");
    expect(preflight).not.toMatch(/sql`\s*(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|TRUNCATE)\b/i);
  });

  it("documented cutover retires the dual Site source rather than promoting the bridge",()=>{
    const adr=read("docs/architecture/adr-one-platform-site-identity.md");
    expect(adr).toContain("one immutable UUID");
    expect(adr).toContain("one-to-one extension");
    expect(adr).toContain("legacy `education_v30.sites`");
    expect(adr).toContain("Remove the old table and bridge");
    expect(adr).toContain("explicitly verified");
  });
});

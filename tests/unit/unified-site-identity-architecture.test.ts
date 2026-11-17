import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path:string) {
  return readFileSync(new URL("../../"+path,import.meta.url),"utf8");
}

describe("one public-schema Site and Organization model",()=>{
  it("extends the existing public Site and Organization instead of adding any bridge",()=>{
    const ddl=read("database/production/2026-11-17-unify-platform-site-foundation.sql");
    expect(ddl).toContain("ALTER TABLE public.sites");
    expect(ddl).toContain("ALTER TABLE public.organizations");
    expect(ddl).toContain("ADD COLUMN IF NOT EXISTS site_kind text");
    expect(ddl).toContain("ADD COLUMN IF NOT EXISTS lifecycle_status text");
    expect(ddl).not.toMatch(/\bCREATE\s+TABLE\b/i);
    expect(ddl).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(ddl).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(ddl).not.toMatch(/\bUPDATE\s+\w+\.sites\b/i);
  });

  it("keeps shared Site identity and lifecycle in the public Drizzle model",()=>{
    const schema=read("src/db/schema/organizations.ts");
    const launch=read("src/modules/programs/launch.functions.ts");
    const siteWizard=read("src/components/launch-studio/SiteFirstLaunch.tsx");
    expect(schema).toContain('siteKind: text("site_kind")');
    expect(schema).toContain('referenceCode: text("reference_code")');
    expect(schema).toContain('lifecycleStatus: text("lifecycle_status")');
    expect(launch).toContain('siteKind:data.siteKind,lifecycleStatus:"planning"');
    expect(siteWizard).toContain("siteKind,stubOnly:false");
  });

  it("only inventories the exact Neon main branch, and performs no writes",()=>{
    const audit=read("scripts/acceptance/check-unified-site-identity.mjs");
    expect(audit).toContain('const MAIN="br-restless-sea-ar9ooo55"');
    expect(audit).toContain('env.CAN_SITE_IDENTITY_PREFLIGHT!=="1"');
    expect(audit).toContain('branch?.branch_id!==MAIN');
    expect(audit).toContain("process.exitCode=2");
    expect(audit).not.toMatch(/sql\`\s*(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|TRUNCATE)\b/i);
  });

  it("documents schema consolidation and removal of duplicate identities",()=>{
    const adr=read("docs/architecture/adr-one-platform-site-identity.md");
    expect(adr).toContain("one public application schema");
    expect(adr).toContain("public.sites.id");
    expect(adr).toContain("No Site identity bridge");
    expect(adr).toContain("not yet executed");
  });
});

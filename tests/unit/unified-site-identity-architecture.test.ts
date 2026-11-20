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
    const launchRoute=read("src/routes/launch.site.tsx");
    expect(schema).toContain('siteKind: text("site_kind")');
    expect(schema).toContain('referenceCode: text("reference_code")');
    expect(schema).toContain('lifecycleStatus: text("lifecycle_status")');
    expect(launch).toContain('siteKind:data.siteKind,lifecycleStatus:"planning"');
    expect(launchRoute).toContain("listLaunchOptions");
    expect(launchRoute).not.toContain("createSite(");
  });

  it("only inventories the exact Neon main branch, and performs no writes",()=>{
    const audit=read("scripts/acceptance/check-unified-site-identity.mjs");
    expect(audit).toContain('const MAIN="br-restless-sea-ar9ooo55"');
    expect(audit).toContain('env.CAN_SITE_IDENTITY_PREFLIGHT!=="1"');
    expect(audit).toContain('branch?.branch_id!==MAIN');
    expect(audit).toContain("process.exitCode=2");
    expect(audit).not.toMatch(/sql\`\s*(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|TRUNCATE)\b/i);
  });

  it("moves native support models directly to public without second identity tables",()=>{
    const learning=read("src/db/canonical-v301/learning.ts");
    const placements=read("src/db/canonical-v301/classroom-site-placements.ts");
    const ddl=read("database/production/2026-11-17-consolidate-drizzle-native-support-tables.sql");
    expect(learning).toContain('contentAssets = pgTable("content_assets"');
    expect(learning).toContain('deploymentOrganizationRoles = pgTable("deployment_organization_roles"');
    expect(placements).toContain('classroomEnrollmentSitePlacements = pgTable("enrollment_site_placements"');
    expect(ddl).toContain("ALTER TABLE education_v30.content_assets SET SCHEMA public");
    expect(ddl).toContain("ALTER TABLE education_v30.enrollment_site_placements SET SCHEMA public");
    expect(ddl).not.toContain("CREATE TABLE");
    expect(ddl).not.toContain("site_canonical_identity_links");
  });

  it("rebinds only reviewed operational foreign keys to the authoritative Site",()=>{
    const ddl=read("database/production/2026-11-17-rebind-public-operational-site-fks.sql");
    const gate=read("scripts/acceptance/check-main-site-schema-consolidation.mjs");
    expect(ddl).toContain("FOREIGN KEY (site_id) REFERENCES public.sites(id)");
    expect(ddl).toContain("public.institutional_approvals");
    expect(ddl).toContain("public.operation_calendar_days");
    expect(ddl).toContain("public.operation_safety_requirements");
    expect(ddl).toContain("c.convalidated");
    expect(gate).toContain("site_bridge_absent");
    expect(gate).toContain("fullConsolidationComplete:summary.canonical_tables===0");
    expect(gate).toContain('const MAIN="br-restless-sea-ar9ooo55"');
    expect(gate).not.toMatch(/sql\`\s*(?:INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b/i);
  });

  it("rebinds empty operating tables directly to the authoritative Organization and Person",()=>{
    const organizations=read("database/production/2026-11-17-rebind-public-operational-organization-fks.sql");
    const people=read("database/production/2026-11-17-rebind-public-operational-person-fks.sql");
    const gate=read("scripts/acceptance/check-main-site-schema-consolidation.mjs");
    expect(organizations).toContain("REFERENCES public.organizations(id)");
    expect(organizations).toContain("Operational table now populated");
    expect(organizations).toContain("c.convalidated");
    expect(people).toContain("REFERENCES public.people(id)");
    expect(people).toContain("Operational table populated");
    expect(people).toContain("access_account_canonical_principals");
    expect(gate).toContain("direct_operational_organization_fks");
    expect(gate).toContain("direct_operational_person_fks");
    expect(gate).toContain("!==26");
    expect(gate).toContain("!==7");
    expect(gate).not.toMatch(/sql\`\s*(?:INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b/i);
  });

  it("fully retires the native Site and denies direct client table access",()=>{
    const migration=read("database/production/2026-11-17-retire-duplicate-native-site.sql");
    const gate=read("scripts/acceptance/check-main-site-schema-consolidation.mjs");
    const catalog=read("src/db/canonical-v301/catalog.ts");
    expect(migration).toContain("DROP TABLE education_v30.sites RESTRICT");
    expect(migration).toContain("ALTER TABLE public.sites FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL PRIVILEGES ON TABLE public.sites");
    expect(migration).toContain("sites_no_direct_client_access");
    expect(gate).toContain("duplicate_site_retired");
    expect(gate).toContain("platform_site_rls_forced");
    expect(catalog).toContain('catalogSites = pgTable("sites"');
    for(const path of [
      "src/modules/sites/site-published-classes.server.ts",
      "src/modules/sites/site-noncredit-releases.server.ts",
      "src/modules/identity/platform-admin.functions.ts",
      "src/modules/identity/canonical-sensitive-approvals.functions.ts",
    ]) {
      expect(read(path)).not.toContain("education_v30.sites");
    }
  });

  it("documents schema consolidation and removal of duplicate identities",()=>{
    const adr=read("docs/architecture/adr-one-platform-site-identity.md");
    expect(adr).toContain("one public application schema");
    expect(adr).toContain("public.sites.id");
    expect(adr).toContain("No Site identity bridge");
    expect(adr).toContain("not yet executed");
  });
});

import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const source=(file:string)=>readFileSync(new URL("../../"+file,import.meta.url),"utf8");

describe("CAN OS main-only core identity FK convergence",()=>{
  it("requires direct shared Site references and keeps the native Site table retirement independent",()=>{
    const first=source("database/production/2026-11-17-rebind-11-core-native-site-fks.sql");
    const rest=source("database/production/2026-11-17-rebind-remaining-29-native-site-fks.sql");
    expect(first).toContain("REFERENCES public.sites(id)");
    expect(rest).toContain("REFERENCES public.sites(id)");
    expect(rest).toContain("Unmigrated native Site FKs");
    expect(rest).not.toMatch(/DROP TABLE\b|CASCADE\b/i);
  });

  it("does not create identity bridges when rekeying Organization foreign keys",()=>{
    const core=source("database/production/2026-11-17-rebind-23-core-native-organization-fks.sql");
    const last=source("database/production/2026-11-17-rebind-final-adult-review-organization-fk.sql");
    expect(core).toContain("REFERENCES public.organizations(id)");
    expect(core).toContain("Unmatched native Organization");
    expect(last).toContain("REFERENCES public.organizations(id) ON DELETE RESTRICT");
    expect(last).toContain("Adult-learning review history changed");
    for(let batch=2;batch<=5;batch++){
      const path="database/production/2026-11-17-rebind-native-organization-fks-batch-"+
        String(batch).padStart(2,"0")+".sql";
      const sql=source(path);
      expect(sql).toContain("REFERENCES public.organizations(id)");
      expect(sql).toContain("Operational table populated");
      expect(sql).not.toMatch(/DROP TABLE\b|CASCADE\b/i);
    }
  });

  it("checks exact Neon main and requires no duplicate Site/Organization FKs",()=>{
    const script=source("scripts/acceptance/check-main-core-identity-fks.mjs");
    expect(script).toContain('const PROJECT="sweet-hall-62441909"');
    expect(script).toContain('MAIN="br-restless-sea-ar9ooo55"');
    expect(script).toContain('process.env.CAN_MAIN_CORE_IDENTITY_CHECK!=="1"');
    expect(script).toContain("summary.legacy_site_fk_count!==0");
    expect(script).toContain("summary.legacy_org_fk_count!==0");
    expect(script).toContain("platform.id=native.id");
    expect(script).toContain("site_identity_bridge_absent");
    expect(script).toContain("fullyConsolidated:");
    expect(script).not.toMatch(/sql`\s*(?:INSERT|UPDATE|DELETE|ALTER|DROP|GRANT|CREATE)\b/i);
  });

  it("leaves published authorization and RLS validation outside FK milestones",()=>{
    const script=source("scripts/acceptance/check-main-core-identity-fks.mjs");
    expect(script).toContain("Public Site RLS and authenticated production browser acceptance are separate release gates");
    const catalog=source("src/modules/programs/launch-site-catalog.server.ts");
    expect(catalog).toContain("lifecycleStatus:sites.lifecycleStatus");
    expect(catalog).toContain("getCanonicalCommandContext(request)");
    expect(catalog).not.toContain("catalogSites");
  });
});

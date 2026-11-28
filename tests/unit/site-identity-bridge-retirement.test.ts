import {existsSync,readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");

describe("one Site UUID; retired identity bridge",()=>{
 it("retirement migration drops only an empty crosswalk, never CASCADE",()=>{
  const sql=read("database/production/2026-11-17-retire-empty-site-identity-bridge.sql");
  expect(sql).toContain("br-restless-sea-ar9ooo55");
  expect(sql).toContain("EXISTS(SELECT 1 FROM public.site_canonical_identity_links)");
  expect(sql).toContain("pg_constraint");
  expect(sql).toContain("pg_proc");
  expect(sql).toContain("DROP TABLE public.site_canonical_identity_links RESTRICT;");
  expect(sql).not.toMatch(/DROP TABLE\s+public\.site_canonical_identity_links\s+CASCADE/i);
 });
 it("all active Site discovery and publication paths use one platform UUID",()=>{
  const files=[
    "src/modules/programs/launch-site-catalog.server.ts",
    "src/modules/sites/site-published-classes.server.ts",
    "src/modules/sites/site-noncredit-releases.server.ts",
    "src/modules/identity/platform-admin.functions.ts",
    "src/modules/identity/canonical-sensitive-approvals.server.ts",
    "src/modules/sites/staff-principal-verification.functions.ts",
  ];
  for(const file of files)
    expect(read(file),file).not.toContain("site_canonical_identity_links");
  expect(read(files[0])).toContain("lifecycleStatus:sites.lifecycleStatus");
  expect(read(files[0])).not.toContain("catalogSites");
  expect(read(files[3])).toContain("native.id=s.id");
  expect(read(files[4])).toContain("assertIssuerOperatingSite(tx,grant.organizationId,grant.siteId)");
  expect(read(files[5])).toContain("retired native Person correspondence");
  expect(read(files[5])).not.toContain("tx.insert(accessAccountCanonicalPrincipals)");
 });
 it("has no Site-link request, confirm, or review service",()=>{
  const ui=read("src/routes/site-identity.tsx");
  expect(ui).toContain("Staff identity review");
  expect(ui).not.toContain("verifyCANStaffCanonicalPrincipal");
  expect(ui).toContain("Staff Person correspondence retired");
  expect(ui).toContain("public Person");
  expect(ui).not.toContain("requestSiteIdentityLink");
  expect(ui).not.toContain("confirmCanonicalSiteIdentityLink");
  expect(ui).not.toContain("reviewSiteIdentityLink");
  expect(existsSync(new URL("../../src/modules/sites/site-identity-links.functions.ts",import.meta.url))).toBe(false);
 });
});

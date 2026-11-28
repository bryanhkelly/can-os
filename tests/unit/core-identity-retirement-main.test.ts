import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");

describe("one public Site and Organization identity",()=>{
  it("maps native Course, Class, enrollment and publisher reads directly to public",()=>{
    const catalog=read("src/db/canonical-v301/catalog.ts");
    const enrollment=read("src/db/canonical-v301/self-enrollment.ts");
    const launch=read("src/modules/programs/launch-site-catalog.server.ts");
    expect(catalog).toContain('catalogSites = pgTable("sites"');
    expect(catalog).toContain('status: text("lifecycle_status")');
    expect(catalog).not.toContain('educationV30.table("sites"');
    expect(enrollment).toContain('canonicalEnrollmentSites = alias(pgTable("sites"');
    expect(enrollment).toContain('canonicalEnrollmentOrganizations = pgTable("organizations"');
    expect(enrollment).not.toContain('educationV30.table("organizations"');
    expect(enrollment).not.toContain('educationV30.table("sites"');
    expect(launch).toContain("lifecycleStatus:sites.lifecycleStatus");
    expect(launch).not.toContain("catalogSites");
  });

  it("preserves restricted staff, reviewer and learner authorization on public Organization",()=>{
    const sql=read("database/production/2026-11-17-repoint-restricted-staff-identity-to-public.sql");
    const funcs=read("database/production/2026-11-17-repoint-five-canonical-organization-functions.sql");
    const issuer=read("src/modules/identity/canonical-sensitive-approvals.server.ts");
    expect(sql).toContain("JOIN public.organizations native_org");
    expect(sql).toContain("native_org.id = source.can_organization_id");
    expect(sql).toContain("JOIN public.sites native_site");
    expect(sql).toContain("person_link.verified_by_account_id <> source.can_account_id");
    expect(sql).not.toContain("JOIN education_v30.organizations");
    expect(funcs).toContain("JOIN public.organizations o");
    expect(funcs).toContain("FROM public.organizations o");
    expect(funcs).toContain("education_v30.v301_canonical_session_context");
    expect(issuer).toContain("FROM public.organizations o JOIN public.sites s");
    expect(issuer).not.toContain("JOIN education_v30.organizations native_org");
  });

  it("retires only duplicate Organization after exact UUID, data and dependency checks",()=>{
    const ddl=read("database/production/2026-11-17-retire-duplicate-native-organization.sql");
    expect(ddl).toContain("p.id=n.id");
    expect(ddl).toContain("p.name=n.display_name");
    expect(ddl).toContain("remaining_fks<>0");
    expect(ddl).toContain("dependent_routines<>0");
    expect(ddl).toContain("DROP TABLE education_v30.organizations RESTRICT");
    expect(ddl).not.toMatch(/DROP TABLE\s+education_v30\.organizations\s+CASCADE/i);
  });

  it("enforces least-privilege direct client access to both core tables",()=>{
    const org=read("database/production/2026-11-17-secure-public-organizations.sql");
    const site=read("database/production/2026-11-17-retire-duplicate-native-site.sql");
    const people=read("database/production/2026-11-17-protect-authoritative-people.sql");
    const gate=read("scripts/acceptance/check-main-core-identity-fks.mjs");
    expect(org).toContain("ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY");
    expect(org).toContain("REVOKE ALL PRIVILEGES ON TABLE public.organizations FROM PUBLIC,authenticated,anonymous");
    expect(org).toContain("organizations_no_direct_client_access");
    expect(people).toContain("ALTER TABLE public.people FORCE ROW LEVEL SECURITY");
    expect(people).toContain("REVOKE ALL PRIVILEGES ON TABLE public.people FROM PUBLIC,authenticated,anonymous");
    expect(people).toContain("people_no_direct_client_access");
    expect(site).toContain("ALTER TABLE public.sites FORCE ROW LEVEL SECURITY");
    expect(gate).toContain("summary.duplicate_site_table_exists||summary.duplicate_org_table_exists");
    expect(gate).toContain("summary.client_can_read_sites||summary.client_can_read_orgs");
    expect(gate).toContain("siteAndOrganizationTablesRetired:true");
    expect(gate).toContain("summary.client_can_read_people||summary.client_can_update_people");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scripts = new URL("../../database/canonical/v3.0.1/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, scripts), "utf8");

/** Guard the security-sensitive, manually reviewed database provisioning.
 * These tests inspect deployable SQL; they do not claim to exercise RLS.
 */
describe("Prepare catalog and Blueprint role provisioning", () => {
  it("grants catalog access to the current public tables, not retired tables", () => {
    const sql = read("provision-program-catalog-role.sql");
    for (const table of [
      "sites", "site_organization_roles", "geographic_areas",
      "blueprint_reference_items", "blueprint_reference_item_versions",
      "offerings", "offering_versions", "qualification_program_fit_policies",
      "qualification_program_fit_policy_versions",
      "qualification_program_fit_policy_version_withdrawals",
    ]) {
      expect(sql, table).toContain(`ON public.${table}`);
      expect(sql, table).not.toContain(`ON education_v30.${table}`);
    }
    expect(sql).toContain("geographic_area_id, lifecycle_status");
    expect(sql).toContain("sites_canonical_catalog_operator_read");
    expect(sql).toContain("education_v30.v30_catalog_program_availability");
  });

  it("keeps Blueprint author and reviewer grants on their distinct table owners", () => {
    const sql = read("provision-blueprint-roles.sql");
    expect(sql).toContain("FROM public.organizations");
    expect(sql).toContain("sites_canonical_catalog_operator_read");
    expect(sql).toContain("GRANT SELECT ON public.%I");
    expect(sql).toContain("GRANT INSERT ON public.%I");
    expect(sql).toContain("public.education_operation_sites");
    expect(sql).toContain("public.sites");
    expect(sql).toContain("public.blueprint_component_approval_decisions");
    expect(sql).toContain("education_v30.evidence_documents");
    expect(sql).toContain("education_v30.audit_events");
    expect(sql).not.toContain("ON education_v30.sites");
    expect(sql).not.toContain("FROM education_v30.organizations");
  });

  it("keeps CAN-published Blueprint definitions separate from Site-owned plans", () => {
    const sql = read("provision-blueprint-roles.sql");
    const authorInsert = sql.slice(
      sql.indexOf("-- Site authoring requires current, verified operator authority."),
      sql.indexOf("-- Reviewer can see verification"),
    );
    expect(authorInsert).toContain("'blueprint_configurations','blueprint_configuration_versions'");
    expect(authorInsert).not.toContain("'blueprints','blueprint_versions'");
    expect(authorInsert).not.toContain("GRANT INSERT ON public.blueprints");
    expect(authorInsert).not.toContain("GRANT UPDATE ON public.blueprint_versions");
    // CAN app administration is separately provisioned. Operator planning
    // cannot be used as a proxy for the global app-admin role.
    const platform = readFileSync(new URL("../../src/modules/identity/platform-admin.functions.ts", import.meta.url), "utf8");
    expect(platform).toContain('assertCapability(actor, "platform.admin")');
    expect(platform).toContain('actor.role !== "app_admin"');
  });

  it("requires a Site-specific, currently effective operator and purpose binding", () => {
    const sql = read("provision-public-site-catalog-rls.sql");
    expect(sql).toContain("CREATE POLICY sites_canonical_catalog_operator_read");
    expect(sql).toContain("AS PERMISSIVE FOR SELECT TO PUBLIC");
    expect(sql).toContain("operator_role.site_id = sites.id");
    expect(sql).toContain("operator_role.role_code = 'operator'");
    expect(sql).toContain("operator_role.valid_through > clock_timestamp()");
    expect(sql).toContain("'program_catalog'");
    expect(sql).toContain("'blueprint_author'");
    expect(sql).toContain("v28_role_can_access_org");
    expect(sql).toContain("sites_no_direct_client_access");
    expect(sql).not.toMatch(/GRANT\s+(SELECT|ALL)\s+ON\s+public\.sites/i);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Regression guard for independently scoped production readiness. */
describe("CAN Site Admin canonical production readiness", () => {
  const source = readFileSync("scripts/acceptance/check-canonical-staff-readiness.mjs", "utf8");

  it("only passes a complete CAN Person + reviewed Site + exact native grant path", () => {
    expect(source).toContain("eligible_staff_paths");
    expect(source).toContain("Number(counts.eligible_staff_paths) > 0");
    expect(source).toContain("person_link.account_id = a.id");
    expect(source).toContain("native_grant.person_id = person_link.canonical_principal_id");
    expect(source).toContain("native_grant.site_id = site_link.canonical_site_id");
    expect(source).toContain("native_grant.role_code = public_grant.role");
    expect(source).toContain("public_site.organization_id = public_grant.organization_id");
    expect(source).toContain("rel.organization_id = native_grant.organization_id");
  });

  it("rejects demo accounts, missing approval, expired grants and absent operator relationships", () => {
    expect(source).toContain("a.email_normalized NOT LIKE '%.demo'");
    expect(source).toContain("site_link.requested_by_person_id <> site_link.reviewed_by_person_id");
    expect(source).toContain("site_link.status = 'approved'");
    expect(source).toContain("person_link.verified_at IS NOT NULL");
    expect(source).toContain("person_link.revoked_at IS NULL");
    expect(source).toContain("native_grant.revoked_at IS NULL");
    expect(source).toContain("rel.valid_through > now()");
  });

  it("blocks unauthorised roles before returning Blueprint Studio entry metadata", () => {
    const home = readFileSync("src/modules/blueprints/blueprint-studio.functions.ts", "utf8");
    const entry = home.slice(home.indexOf("export const readCanonicalBlueprintHome"), home.indexOf("export const exploreCanonicalBlueprintReferences"));
    expect(entry).toContain('assertCapability(context, "blueprint.read")');
    expect(entry.indexOf('assertCapability(context, "blueprint.read")')).toBeLessThan(entry.indexOf("return {"));
  });

  it("cannot create identities or alter authority while checking readiness", () => {
    expect(source).toContain('client.query("BEGIN READ ONLY")');
    expect(source).toContain('client.query("ROLLBACK")');
    expect(source).not.toMatch(/client\.query\(\s*`\s*(INSERT|UPDATE|DELETE|ALTER|CREATE)\b/i);
  });
});

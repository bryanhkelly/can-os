import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  mayApprovePlatformVersion, savePlatformProgramSchema,
  savePlatformBlueprintSchema, platformCatalogDecisionSchema,
} from "@/domain/platform-catalog";

describe("platform-owned Program Catalog and Solution Blueprint authority", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";

  it("requires distinct verified people for a planning publication review", () => {
    expect(mayApprovePlatformVersion(id, other)).toBe(true);
    expect(mayApprovePlatformVersion(id, id)).toBe(false);
    expect(mayApprovePlatformVersion(null, other)).toBe(false);
    expect(mayApprovePlatformVersion(id, null)).toBe(false);
  });

  it("rejects duplicate recipe components and extra user-supplied publisher identity", () => {
    const value = {
      code: "can.pilot.demo", title: "Sample Blueprint", targetKind: "composite",
      programCode: "can.program.demo", expectedVersion: 0,
      components: [
        {key: "instruction", kind: "program_model", requirementMode: "required", description: ""},
        {key: "instruction", kind: "activity", requirementMode: "optional", description: ""},
      ],
    };
    expect(savePlatformBlueprintSchema.safeParse(value).success).toBe(false);
    expect(savePlatformBlueprintSchema.safeParse({
      ...value, components: [value.components[0]],
      publisherOrganizationId: id,
    }).success).toBe(false);
    expect(savePlatformBlueprintSchema.safeParse({
      ...value, components: [value.components[0]], offeringCode: "CLC-DIGITAL-01",
    }).success).toBe(true);
  });

  it("validates constrained Program drafts and exact version decisions", () => {
    expect(savePlatformProgramSchema.safeParse({
      code: "can.program.demo", category: "community",
      title: "Sample Program", summary: "Example for local operators",
      description: "", expectedVersion: 0,
    }).success).toBe(true);
    expect(savePlatformProgramSchema.safeParse({
      code: "can.program.demo", category: "community",
      title: "Sample Program", summary: "Example for local operators",
      description: "", expectedVersion: -1,
    }).success).toBe(false);
    expect(platformCatalogDecisionSchema.safeParse({ kind: "blueprint", versionId: id }).success).toBe(true);
    expect(platformCatalogDecisionSchema.safeParse({
      kind: "blueprint", versionId: id, reviewerId: other,
    }).success).toBe(false);
  });

  it("keeps platform management server-only and planning-only", () => {
    const source = readFileSync("src/modules/blueprints/platform-catalog.functions.ts", "utf8");
    expect(source).toContain('actor.role !== "app_admin"');
    expect(source).toContain("isDemoAccountEmail(account.email)");
    expect(source).toContain('assertCapability(actor, "platform.admin")');
    expect(source).toContain('mayApprovePlatformVersion(authorId, actor.actorPersonId)');
    expect(source).toContain('if (!authorId) throw new AuthorizationError("audited CAN planning draft author")');
    expect(source).toContain('action: "platform.catalog.version.created"');
    expect(source).toContain('action: "platform.catalog.plan.approved"');
    expect(source).toContain('action: "platform.catalog.version.published"');
    expect(source).toContain('eq(organizations.type, "can_network")');
    expect(source).not.toContain("SET LOCAL ROLE");
    expect(source).toContain("gradeRange: latest?.gradeRange");
    expect(source).toContain("scheduleSuggestion: latest?.scheduleSuggestion");
    expect(source).toContain("configurationGuidance: latest?.configurationGuidance");
    expect(source).toContain("FROM public.blueprint_facility_requirements");
    expect(source).toContain("FROM public.blueprint_component_dependencies");
    expect(source).toContain("Cannot remove a component with Blueprint dependencies");
    expect(source).not.toContain("enrollMyselfInNoncredit");
    expect(source).not.toContain("site_organization_roles");
  });
});

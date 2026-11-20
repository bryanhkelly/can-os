import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publicSolutionComponentDescription } from "@/domain/public-solution-component";

describe("CAN-published Solution component details", () => {
  it("projects only the public-facing description and independent-review flag", () => {
    const result = publicSolutionComponentDescription({
      description: "  An onsite facilitator, devices and connectivity.  ",
      requiresIndependentReview: true,
      internalApprovalStrategy: "private",
      unpublishedPolicyId: "internal-only",
      pricingSecret: "never disclose",
    });
    expect(result).toEqual({
      description: "An onsite facilitator, devices and connectivity.",
      requiresIndependentReview: true,
    });
    expect(result).not.toHaveProperty("internalApprovalStrategy");
    expect(result).not.toHaveProperty("unpublishedPolicyId");
    expect(result).not.toHaveProperty("pricingSecret");
  });

  it("does not treat malformed or absent metadata as authorization", () => {
    for (const spec of [null, "", [], { description: 22 }, { description: " " }]) {
      expect(publicSolutionComponentDescription(spec).requiresIndependentReview).toBe(false);
    }
    expect(publicSolutionComponentDescription({
      description: "Example", requiresIndependentReview: "true",
    })).toEqual({ description: "Example", requiresIndependentReview: false });
    expect(publicSolutionComponentDescription({ description: "a".repeat(1000) })
      .description).toHaveLength(500);
  });

  it("keeps published requirements in Prepare without leaking the raw Blueprint spec", () => {
    const reader = readFileSync("src/modules/blueprints/blueprint-workspace.server.ts", "utf8");
    const catalog = readFileSync("src/components/launch-studio/SolutionCatalogV61.tsx", "utf8");
    const editor = readFileSync("src/components/launch-studio/CanonicalBlueprintWorkspace.tsx", "utf8");
    expect(reader).toContain("publicSolutionComponentDescription(componentSpec)");
    expect(reader).toContain('eq(blueprintVersions.lifecycle, "published")');
    expect(reader).not.toContain("componentSpec: component.componentSpec");
    expect(catalog).toContain("component.description");
    expect(catalog).toContain("Independent review required before operation");
    expect(editor).toContain("component.description");
    expect(editor).toContain("Independent verification remains separate from planning");
  });
});

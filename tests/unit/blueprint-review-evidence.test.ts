import { describe, expect, it } from "vitest";
import {readFileSync} from "node:fs";
import {
  blueprintReviewEvidenceInputSchema,
  listBlueprintReviewEvidence,
} from "@/modules/blueprints/blueprint-review-evidence.server";

const organizationId = "00000000-0000-4000-8000-000000000001";
const context = {
  actorPersonId: "00000000-0000-4000-8000-000000000002",
  capabilities: new Set(["blueprint.review"]),
  scope: { organizationIds: [organizationId] },
};

describe("Blueprint approval evidence selection", () => {
  it("accepts only an exact Organization selector", () => {
    expect(blueprintReviewEvidenceInputSchema.parse({ owningOrganizationId: organizationId }))
      .toEqual({ owningOrganizationId: organizationId });
    expect(blueprintReviewEvidenceInputSchema.safeParse({
      owningOrganizationId: organizationId, includePrivateStorage: true,
    }).success).toBe(false);
  });

  it("denies a reviewer requesting another Organization's evidence",async()=>{
    await expect(listBlueprintReviewEvidence(context,{
      owningOrganizationId:"00000000-0000-4000-8000-000000000009",
    })).rejects.toMatchObject({name:"AuthorizationError"});
  });
  it("does not depend on an environment rollout flag",()=>{
    const source=readFileSync("src/modules/blueprints/blueprint-review-evidence.server.ts","utf8");
    expect(source).not.toContain("CAN_CANONICAL_BLUEPRINT_WRITE_ENABLED");
    expect(source).toContain('assertCapability(context, "blueprint.review")');
    expect(source).toContain("context.scope.organizationIds?.includes(owningOrganizationId)");
  });
});

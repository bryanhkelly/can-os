import { describe, expect, it, vi } from "vitest";
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

  it("denies a reviewer requesting another Organization's evidence", async () => {
    vi.stubEnv("CAN_CANONICAL_BLUEPRINT_WRITE_ENABLED", "true");
    try {
      await expect(listBlueprintReviewEvidence(context, {
        owningOrganizationId: "00000000-0000-4000-8000-000000000009",
      })).rejects.toMatchObject({ name: "AuthorizationError" });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("is not reachable before canonical write access is enabled", async () => {
    vi.stubEnv("CAN_CANONICAL_BLUEPRINT_WRITE_ENABLED", "false");
    try {
      await expect(listBlueprintReviewEvidence(context, { owningOrganizationId: organizationId }))
        .rejects.toMatchObject({ code: "UNAVAILABLE" });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

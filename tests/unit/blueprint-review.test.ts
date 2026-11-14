import { describe, expect, it } from "vitest";
import {
  blueprintReviewReadInputSchema,
  decideBlueprintReviewInputSchema,
} from "@/domain/blueprint-review";

const configurationVersionId = "00000000-0000-4000-8000-000000000001";
const reviewId = "00000000-0000-4000-8000-000000000002";
const componentId = "00000000-0000-4000-8000-000000000003";
const evidenceVersionId = "00000000-0000-4000-8000-000000000004";

const approved = {
  reviewId,
  configurationVersionId,
  decision: "approved" as const,
  evidenceVersionId,
  rationale: "The submitted plan and supporting evidence have been independently reviewed.",
  components: [{
    componentId,
    decision: "approved" as const,
    evidenceVersionId,
  }],
};

describe("canonical Blueprint review commands", () => {
  it("accepts an evidence-backed whole-configuration and component approval", () => {
    expect(decideBlueprintReviewInputSchema.parse(approved)).toMatchObject(approved);
  });

  it("accepts rejection without pretending a Deployment is authorized", () => {
    const result = decideBlueprintReviewInputSchema.parse({
      reviewId,
      configurationVersionId,
      decision: "rejected",
      rationale: "The building plan needs independent review before approval.",
    });
    expect(result.decision).toBe("rejected");
    expect(result.components).toEqual([]);
  });

  it("requires evidence for all approvals", () => {
    expect(decideBlueprintReviewInputSchema.safeParse({
      ...approved, evidenceVersionId: null,
    }).success).toBe(false);
    expect(decideBlueprintReviewInputSchema.safeParse({
      ...approved, components: [{ componentId, decision: "approved" }],
    }).success).toBe(false);
  });

  it("rejects conflicting or duplicate component review decisions", () => {
    expect(decideBlueprintReviewInputSchema.safeParse({
      ...approved,
      components: [{ componentId, decision: "denied" }],
    }).success).toBe(false);
    expect(decideBlueprintReviewInputSchema.safeParse({
      ...approved, components: [approved.components[0], approved.components[0]],
    }).success).toBe(false);
  });

  it("never accepts caller-supplied authority, author identity, or execution state", () => {
    expect(decideBlueprintReviewInputSchema.safeParse({
      ...approved, reviewerPersonId: "00000000-0000-4000-8000-000000000005",
    }).success).toBe(false);
    expect(decideBlueprintReviewInputSchema.safeParse({
      ...approved, executionStatus: "authorized",
    }).success).toBe(false);
    expect(blueprintReviewReadInputSchema.safeParse({
      configurationVersionId,
      organizationId: "00000000-0000-4000-8000-000000000006",
    }).success).toBe(false);
  });
});

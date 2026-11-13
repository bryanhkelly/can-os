import { describe, expect, it } from "vitest";
import { createProgramFitReviewInputSchema } from "../../src/domain/program-fit-review";

const validInput = {
  reviewId: "00000000-0000-4000-8000-000000000001",
  assessmentId: "00000000-0000-4000-8000-000000000002",
  reviewOutcome: "needs_verification",
  rationale: "Additional site evidence is required.",
};

describe("canonical program-fit review input", () => {
  it("accepts a bounded review without caller-selected authority or supersession", () => {
    expect(createProgramFitReviewInputSchema.parse(validInput)).toEqual(validInput);
  });

  it("requires both override justification and evidence", () => {
    expect(() => createProgramFitReviewInputSchema.parse({
      ...validInput,
      overrideJustification: "An exception is supported.",
    })).toThrow();
    expect(() => createProgramFitReviewInputSchema.parse({
      ...validInput,
      overrideEvidenceVersionId: "00000000-0000-4000-8000-000000000003",
    })).toThrow();
    expect(createProgramFitReviewInputSchema.parse({
      ...validInput,
      overrideJustification: "An exception is supported.",
      overrideEvidenceVersionId: "00000000-0000-4000-8000-000000000003",
    }).overrideEvidenceVersionId).toBe("00000000-0000-4000-8000-000000000003");
  });

  it("rejects caller-supplied authorization and empty rationales", () => {
    expect(() => createProgramFitReviewInputSchema.parse({
      ...validInput,
      reviewerAuthorizationId: "00000000-0000-4000-8000-000000000003",
    })).toThrow();
    expect(() => createProgramFitReviewInputSchema.parse({
      ...validInput,
      rationale: "   ",
    })).toThrow();
  });
});

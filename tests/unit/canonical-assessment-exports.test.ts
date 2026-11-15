import { describe, expect, it } from "vitest";
import {
  assessmentDefinitions as canonicalDefinitions,
  assessmentVersions as canonicalVersions,
  assessmentFormVersions,
} from "@/db/canonical-v301";
import {
  assessmentDefinitions as learningDefinitions,
  assessmentVersions as learningVersions,
} from "@/db/canonical-v301/learning";
import {
  assessmentDefinitions as assessmentDefinitionsProjection,
  assessmentVersions as assessmentVersionsProjection,
} from "@/db/canonical-v301/assessments";

/** Regression: wildcard barrel exports must resolve to one canonical Drizzle
 * table instance, not two independently declared mappings of the same table. */
describe("canonical assessment schema exports", () => {
  it("uses one assessment definitions table across both schema modules", () => {
    expect(canonicalDefinitions).toBe(learningDefinitions);
    expect(assessmentDefinitionsProjection).toBe(learningDefinitions);
  });

  it("uses one assessment versions table across both schema modules", () => {
    expect(canonicalVersions).toBe(learningVersions);
    expect(assessmentVersionsProjection).toBe(learningVersions);
  });

  it("preserves the assessment form mapping from assessments", () => {
    expect(assessmentFormVersions).toBeDefined();
  });
});

import { describe, expect, it } from "vitest";
import { summarizeQualificationObservations } from "@/domain/canonical-qualification-lab";

const observation = (policyRequirementId: string, resultOrder: bigint,
  determination: string, verificationLevel = "reported", sourceEvidenceVersionId: string | null = null) =>
  ({policyRequirementId, resultOrder, determination, verificationLevel, sourceEvidenceVersionId});

describe("site qualification observation summaries", () => {
  it("uses latest requirement results and never double-counts superseded decisions", () => {
    const rows = [
      observation("network", 1n, "deficient"),
      observation("network", 3n, "satisfied", "verified", "evidence-v2"),
      observation("safety", 2n, "pending"),
      observation("equipment", 4n, "deficient", "verified"),
    ];
    expect(summarizeQualificationObservations(rows)).toEqual({
      requirementsObserved: 3, satisfied: 1, deficient: 1,
      pending: 1, verified: 2, evidenceLinked: 1,
    });
  });
  it("returns zero totals for a new application without fit evidence", () => {
    expect(summarizeQualificationObservations([])).toEqual({
      requirementsObserved: 0, satisfied: 0, deficient: 0,
      pending: 0, verified: 0, evidenceLinked: 0,
    });
  });
});

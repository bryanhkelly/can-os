import { describe, expect, it } from "vitest";
import {
  initialRequirementStatus,
  materializeJourneyRequirements,
} from "@/modules/journeys/instantiate";

// Definition selection (key + active + earliest createdAt) lives in SQL and is
// covered by integration tests; these tests pin the pure materialization rules
// shared by the enrollment and program-launch call sites.

describe("initialRequirementStatus", () => {
  it.each([
    ["can", "needs_can"],
    ["third_party", "waiting_third_party"],
    ["family", "needs_you"],
    ["partner", "needs_you"],
    [undefined, "needs_you"],
  ] as const)("maps owner %s to %s", (owner, status) => {
    expect(initialRequirementStatus(owner)).toBe(status);
  });
});

describe("materializeJourneyRequirements", () => {
  it("returns no rows when configuration has no requirements", () => {
    expect(materializeJourneyRequirements("journey", {})).toEqual([]);
    expect(
      materializeJourneyRequirements("journey", { requirements: undefined }),
    ).toEqual([]);
  });

  it("retains evidence instructions from the Journey definition", () => {
    expect(materializeJourneyRequirements("journey", {
      requirements: [{ key: "safety", title: "Safety evidence", blocking: true,
        evidenceInstructions: "Upload the current safety plan." }],
    })[0]?.metadata).toEqual({ evidenceInstructions: "Upload the current safety plan." });
  });

  it("materializes rows with blocking default and owner-derived status", () => {
    expect(
      materializeJourneyRequirements("journey", {
        requirements: [
          { key: "staffing", title: "Staffing complete", blocking: true, owner: "partner" },
          { key: "readiness", title: "Teacher readiness", owner: "can" },
          { key: "background-check", title: "Background check", owner: "third_party" },
          { key: "consent", title: "Consent form" },
        ],
      }),
    ).toEqual([
      { journeyId: "journey", key: "staffing", title: "Staffing complete", blocking: true, status: "needs_you" },
      { journeyId: "journey", key: "readiness", title: "Teacher readiness", blocking: false, status: "needs_can" },
      { journeyId: "journey", key: "background-check", title: "Background check", blocking: false, status: "waiting_third_party" },
      { journeyId: "journey", key: "consent", title: "Consent form", blocking: false, status: "needs_you" },
    ]);
  });
});

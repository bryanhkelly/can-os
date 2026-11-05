import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors";
import { launchMilestoneAvailable, supplementaryRead, type LaunchReadStates } from "@/lib/supplementary-read";
describe("launch read evidence", () => {
  it("distinguishes real empty results from unavailable and unauthorized reads", async () => {
    expect(await supplementaryRead(async () => [], data => !data.length)).toEqual({ state: "empty", data: [] });
    expect(await supplementaryRead(async () => [1], data => !data.length)).toEqual({ state: "ready", data: [1] });
    expect(await supplementaryRead(async () => { throw new Error("database unavailable"); }, () => false)).toEqual({ state: "unavailable", data: null });
    expect(await supplementaryRead(async () => { throw new DomainError("FORBIDDEN"); }, () => false)).toEqual({ state: "unauthorized", data: null });
  });
  it("never uses failed jurisdiction or enrollment reads as readiness evidence", () => {
    const states: LaunchReadStates = { preparationPrograms: "ready", familyInvitations: "empty", admissionsCounts: "empty", enrollmentCounts: "empty", extendedPlanning: "empty", jurisdictionGuidance: "ready", jurisdictionResearch: "empty" };
    expect(launchMilestoneAvailable(states, "opening")).toBe(true);
    for (const key of ["jurisdictionGuidance", "jurisdictionResearch", "enrollmentCounts"] as const) {
      expect(launchMilestoneAvailable({ ...states, [key]: "unavailable" }, "opening")).toBe(false);
      expect(launchMilestoneAvailable({ ...states, [key]: "unauthorized" }, "opening")).toBe(false);
    }
  });
});
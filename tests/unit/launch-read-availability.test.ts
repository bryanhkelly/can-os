import { describe, expect, it } from "vitest";
import { supplementaryRead, launchMilestoneAvailable, type LaunchReadStates } from "@/lib/supplementary-read";

/** This is the shared read-state policy exercised by the current Settings and
 * Launch destinations. The retired /launch/school route no longer exists. */
const baseline: LaunchReadStates = {
  preparationPrograms: "empty",
  familyInvitations: "empty",
  admissionsCounts: "empty",
  enrollmentCounts: "empty",
  extendedPlanning: "empty",
  jurisdictionGuidance: "empty",
  jurisdictionResearch: "empty",
};

describe("launch and settings supplementary-read availability", () => {
  it("retains failed jurisdiction and enrollment reads as unavailable, not zero outstanding work", async () => {
    const [guidance, enrollments] = await Promise.all([
      supplementaryRead(() => Promise.reject(new Error("unavailable")), () => true),
      supplementaryRead(() => Promise.reject(new Error("unavailable")), () => true),
    ]);
    expect(guidance).toEqual({ state: "unavailable", data: null });
    expect(enrollments).toEqual({ state: "unavailable", data: null });
    const states: LaunchReadStates = {
      ...baseline,
      jurisdictionGuidance: guidance.state,
      enrollmentCounts: enrollments.state,
    };
    expect(launchMilestoneAvailable(states, "opening")).toBe(false);
  });

  it("distinguishes permission denial from unavailable service", async () => {
    const research = await supplementaryRead(
      () => Promise.reject({ code: "FORBIDDEN" }), () => true,
    );
    expect(research).toEqual({ state: "unauthorized", data: null });
    const states: LaunchReadStates = { ...baseline, jurisdictionResearch: research.state };
    expect(launchMilestoneAvailable(states, "configuration")).toBe(false);
  });

  it("preserves successful empty reads as actual empty results", async () => {
    const [enrollments, guidance] = await Promise.all([
      supplementaryRead(async () => [] as string[], data => data.length === 0),
      supplementaryRead(async () => ({} as Record<string, unknown>),
        data => Object.keys(data).length === 0),
    ]);
    expect(enrollments).toEqual({ state: "empty", data: [] });
    expect(guidance).toEqual({ state: "empty", data: {} });
    const states: LaunchReadStates = {
      ...baseline,
      enrollmentCounts: enrollments.state,
      jurisdictionGuidance: guidance.state,
    };
    expect(launchMilestoneAvailable(states, "opening")).toBe(true);
  });
});

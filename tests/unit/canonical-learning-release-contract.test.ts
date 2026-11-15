import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

/** Static release contract; browser and restricted-role acceptance remain separate. */
describe("secure canonical learning runtime boundaries", () => {
  it("uses restricted readiness rather than optional deployment feature flags", () => {
    const guards = source("src/modules/learning/canonical-learning-release.server.ts");
    const availability = source("src/modules/learning/canonical-learning-release.functions.ts");
    expect(guards).not.toContain('process.env.CAN_CANONICAL_ACTIVITY_ENABLED');
    expect(guards).not.toContain('process.env.CAN_FACILITATED_LEARNING_ENABLED');
    expect(guards).toContain("canonicalRestrictedAuthUrlValid");
    expect(guards).toContain("CAN_FACILITATED_PAIRING_PEPPER");
    expect(availability).toContain("canonicalLearningRuntimeReady()");
    expect(availability).toContain("facilitatedLearningRuntimeReady()");
  });

  it("preserves recorded lessons while telemetry is disabled", () => {
    const workspace = source("src/components/learning/RecordedInstructorWorkspace.tsx");
    const provider = source("src/components/learning/CanonicalLearningTracker.tsx");
    expect(workspace).toContain("release.data?.activity === true");
    expect(workspace).toContain("<DisabledCanonicalLearningActivityProvider");
    expect(workspace).toContain("activityEnabled && <CanonicalCourseEvidencePanel");
    expect(workspace).toContain("facilitatedEnabled && <FacilitatedLearnerPairing");
    expect(provider).toContain("disabledLearningActivity");
    expect(provider).toContain("observeNativeVideo: () => undefined");
  });

  it("hides unavailable facilitator and impact routes from the lab navigation", () => {
    const nav = source("src/components/capability-lab/CapabilityLabNav.tsx");
    expect(nav).toContain('release.data?.facilitated === true');
    expect(nav).toContain('facilitatedEnabled || current === "facilitated"');
    expect(nav).toContain('facilitatedEnabled || current === "impact"');
  });

  it("enforces the server release gate on every activity endpoint", () => {
    const modules = [
      ["src/modules/learning/canonical-learning-activity.functions.ts",
        "requireCanonicalLearningActivityEnabled()"],
      ["src/modules/learning/canonical-course-evidence.functions.ts",
        "requireCanonicalLearningActivityEnabled()"],
      ["src/modules/learning/facilitated-learning.functions.ts",
        "requireFacilitatedLearningEnabled()"],
      ["src/modules/learning/facilitated-impact.functions.ts",
        "requireFacilitatedLearningEnabled()"],
    ] as const;
    for (const [path, gate] of modules) {
      const body = source(path);
      const handlers = body.match(/\.handler\(async/g)?.length ?? 0;
      const guarded = body.split(gate).length - 1;
      expect(handlers, path).toBeGreaterThan(0);
      expect(guarded, path).toBe(handlers);
    }
  });
});

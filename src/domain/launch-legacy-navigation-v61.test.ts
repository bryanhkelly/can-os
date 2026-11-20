import { describe, expect, it } from "vitest";
import { schoolLaunchSteps } from "./launch-studio";
import { siteLaunchModules } from "./launch-site-navigation-v61";
import { legacySchoolStepModuleV61 } from "./launch-legacy-navigation-v61";

describe("Legacy school setup navigation into canonical V6.1 Launch Studio", () => {
  it("maps every legacy step to an active V6.1 module or the overview", () => {
    const canonicalIds = new Set(siteLaunchModules.map(item => item.id));
    for (const step of schoolLaunchSteps) {
      const destination = legacySchoolStepModuleV61(step);
      if (step === "welcome") {
        expect(destination).toBeUndefined();
      } else {
        expect(destination, `Unrecognized canonical destination for ${step}`).toBeDefined();
        expect(canonicalIds.has(destination!)).toBe(true);
      }
    }
  });

  it("uses the original V6.1 Program Catalog and safety workflows", () => {
    expect(legacySchoolStepModuleV61("academics")).toBe("program-catalog");
    expect(legacySchoolStepModuleV61("readiness")).toBe("opening-compliance");
    expect(legacySchoolStepModuleV61("families")).toBe("recruit");
    expect(legacySchoolStepModuleV61("next")).toBe("open");
  });
});

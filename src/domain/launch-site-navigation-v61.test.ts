import { describe, expect, it } from "vitest";
import { prepareStageModulesV61 } from "@/domain/launch-prepare-v61";
import { siteLaunchModules, siteLaunchStagesV61 } from "./launch-site-navigation-v61";

describe("canonical V6.1 Launch Studio navigation", () => {
  it("has unique, stable module keys across all four stages", () => {
    const ids = siteLaunchModules.map(module => module.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(siteLaunchStagesV61).toEqual(["Shape", "Share", "Prepare", "Launch"]);
    expect(new Set(siteLaunchModules.map(module => module.stage)))
      .toEqual(new Set(siteLaunchStagesV61));
  });

  it("uses Prepare's canonical catalog instead of copying a second list", () => {
    const prepared = siteLaunchModules.filter(module => module.stage === "Prepare");
    expect(prepared.map(module => module.id))
      .toEqual(prepareStageModulesV61.map(module => module.id));
    expect(prepared.map(module => module.title))
      .toEqual(prepareStageModulesV61.map(module => module.title));
  });

  it("keeps Site Profile and Website & Brand in Shape, outreach in Share, and Launch last", () => {
    expect(siteLaunchModules[0]).toMatchObject({ stage: "Shape", id: "site-profile" });
    expect(siteLaunchModules.find(module => module.id === "website-brand")?.stage).toBe("Shape");
    expect(siteLaunchModules.find(module => module.id === "create-outreach")?.stage).toBe("Share");
    expect(siteLaunchModules.find(module => module.id === "my-outreach")?.stage).toBe("Share");
    expect(siteLaunchModules.at(-1)).toMatchObject({ stage: "Launch", id: "open", title: "Opening Checklist" });
  });
});

import { describe, expect, it } from "vitest";
import { providerContentCapability, providerContentHome, requireProviderContentRole } from "@/domain/provider-content-workspace-access";

describe("provider content workspace role boundary", () => {
  it("routes only verified instructional creators and independent reviewers to separate workspaces", () => {
    expect(providerContentHome("academic_content_creator")).toBe("/canonical/content");
    expect(providerContentHome("academic_content_reviewer")).toBe("/canonical/content-reviews");
    expect(providerContentCapability("academic_content_creator")).toBe("instructional_track.author");
    expect(providerContentCapability("academic_content_reviewer")).toBe("instructional_track.review");
    expect(requireProviderContentRole("academic_content_creator")).toBe("academic_content_creator");
    for (const role of ["site_admin","registrar","teacher","student","guardian","network_admin","blueprint_reviewer"]) {
      expect(() => requireProviderContentRole(role)).toThrow();
    }
  });
});

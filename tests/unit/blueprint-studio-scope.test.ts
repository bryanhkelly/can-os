import { describe, expect, it } from "vitest";
import { requireBlueprintSiteScope } from "@/domain/blueprint-studio-scope";
import type { CommandContext } from "@/domain/command-context";

const siteId = "00000000-0000-4000-8000-000000000001";
const context: CommandContext = {
  actorPersonId: "00000000-0000-4000-8000-000000000002",
  capabilities: new Set(["blueprint.read", "blueprint.configure"]),
  scope: { siteIds: [siteId], organizationIds: ["00000000-0000-4000-8000-000000000003"] },
};

describe("canonical Blueprint Studio Site ownership", () => {
  it("permits a configuration attached to the verified Site", () => {
    expect(requireBlueprintSiteScope(context, { siteId })).toBe(siteId);
  });
  it("does not allow another Site in the same Organization", () => {
    expect(() => requireBlueprintSiteScope(context, {
      siteId: "00000000-0000-4000-8000-000000000004",
    })).toThrow();
  });
  it("does not treat a missing Site or arbitrary planning value as authority", () => {
    for (const value of [{}, { siteId: null }, { siteId: ["other"] }, null]) {
      expect(() => requireBlueprintSiteScope(context, value)).toThrow();
    }
  });
});

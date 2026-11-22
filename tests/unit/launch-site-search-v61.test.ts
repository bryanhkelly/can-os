import { describe, expect, it } from "vitest";
import { siteLaunchSearchSchemaV61 } from "@/domain/launch-site-search-v61";

const siteId = "f1000000-0000-4000-8000-000000000038";

describe("Launch Studio module URL compatibility", () => {
  it("opens the existing Promote bookmark in Create Outreach", () => {
    const url = new URL("https://can-os.bryanhkelly.workers.dev/launch/site" +
      "?siteId=" + siteId + "&module=promote");
    const parsed = siteLaunchSearchSchemaV61.parse(
      Object.fromEntries(url.searchParams),
    );
    expect(parsed).toMatchObject({ siteId, module: "create-outreach" });
  });

  it.each([
    ["recruit", "create-outreach"],
    ["recruitment", "create-outreach"],
    ["events", "create-outreach"],
    ["interest-events", "create-outreach"],
    ["create-outreach", "create-outreach"],
    ["my-outreach", "my-outreach"],
    ["site-profile", "site-profile"],
    ["program-catalog", "program-catalog"],
  ])("normalizes module=%s to %s", (input, expected) => {
    expect(siteLaunchSearchSchemaV61.parse({ siteId, module: input }).module)
      .toBe(expected);
  });

  it("falls back to the Site overview for unknown or malformed module values", () => {
    for (const module of ["not-a-module", "", "__proto__", 42, null, ["promote"]]) {
      const parsed = siteLaunchSearchSchemaV61.parse({ siteId, module });
      expect(parsed.siteId).toBe(siteId);
      expect(parsed.module).toBeUndefined();
    }
  });

  it("does not weaken Site or Solution identifier validation", () => {
    expect(() => siteLaunchSearchSchemaV61.parse({
      siteId: "invalid", module: "promote",
    })).toThrow();
    expect(() => siteLaunchSearchSchemaV61.parse({
      siteId, solutionPlanId: "not-a-uuid", module: "promote",
    })).toThrow();
  });
});

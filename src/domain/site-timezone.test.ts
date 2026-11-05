import { describe, expect, it } from "vitest";
import { churchApplicationSchema } from "./church-application";
import { schoolSetupSchema } from "./school-setup";
import { DEFAULT_SITE_TIMEZONE, siteTimezoneOptions, siteTimezoneSchema } from "./site-timezone";

describe("Site timezone contract", () => {
  it("shares the default and valid zone options", () => {
    expect(DEFAULT_SITE_TIMEZONE).toBe("America/Los_Angeles");
    expect(siteTimezoneSchema.safeParse(DEFAULT_SITE_TIMEZONE).success).toBe(true);
    expect(siteTimezoneOptions().includes("America/Los_Angeles")).toBe(true);
    expect(siteTimezoneOptions("Etc/GMT+2").includes("Etc/GMT+2")).toBe(true);
  });

  it("rejects invalid timezone values in both onboarding payloads", () => {
    expect(siteTimezoneSchema.safeParse("Mars/Olympus").success).toBe(false);
    expect(schoolSetupSchema.safeParse({
      name: "Demo School", domain: "newschool.demo", timezone: "Mars/Olympus", syntheticOnly: true,
    }).success).toBe(false);
    expect(churchApplicationSchema.safeParse({
      churchName: "First Church", siteName: "First School", timezone: "Mars/Olympus",
      churchWebsite: "", leaderTitle: "Pastor", contactEmail: "pastor@example.org",
      firstName: "A", lastName: "Person",
    }).success).toBe(false);
  });
});
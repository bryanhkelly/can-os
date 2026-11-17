import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { schoolPlanningLocationSchema } from "@/domain/school-stub";
import { siteInformationSchema } from "@/domain/site-setup-configuration";

const launchConsumers = [
  "src/modules/programs/launch-website.functions.ts",
  "src/routes/launch.site-preview.ts",
  "src/modules/sites/site-website-preview.server.ts",
] as const;

/** Regression for Cloudflare SSR missing-export failures (November 2026).
 * Planning location belongs to school-stub; Site information belongs to
 * site-setup-configuration. They are independent private data contracts.
 */
describe("Site planning location import and validation contract", () => {
  it("keeps private planning locations distinct from verified physical addresses", () => {
    expect(schoolPlanningLocationSchema.parse({ city: "Tampa", state: "fl" }))
      .toEqual({ city: "Tampa", state: "FL" });
    expect(schoolPlanningLocationSchema.safeParse({ city: "Tampa", state: "XX" }).success)
      .toBe(false);
    expect(schoolPlanningLocationSchema.safeParse({
      city: "Tampa", state: "FL", street1: "unverified",
    }).success).toBe(false);
    expect(siteInformationSchema.safeParse({
      contexts: [], hostChurchName: "", currentWebsiteUrl: "", otherContext: "",
    }).success).toBe(true);
  });

  it("all Launch and Website Studio readers import the canonical schema from its defining module", () => {
    for (const path of launchConsumers) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toMatch(
        /import\s*\{[^}]*\bschoolPlanningLocationSchema\b[^}]*\}\s*from\s*["']@\/domain\/school-stub["']/,
      );
      expect(source, path).not.toMatch(
        /import\s*\{[^}]*\bschoolPlanningLocationSchema\b[^}]*\}\s*from\s*["']@\/domain\/site-setup-configuration["']/,
      );
    }
    const websitePreview = readFileSync(launchConsumers[2], "utf8");
    expect(websitePreview).toMatch(
      /import\s*\{[^}]*\bsiteInformationSchema\b[^}]*\}\s*from\s*["']@\/domain\/site-setup-configuration["']/,
    );
  });
});

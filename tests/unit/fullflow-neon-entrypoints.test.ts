import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("FullFlow Neon branch isolation", () => {
  it("pins only the FullFlow integration mode before test execution", () => {
    const source = readFileSync("scripts/run-integration-tests.mjs", "utf8");
    expect(source).toContain('if (mode === "full-flow") {\n  const branchCheck');
    expect(source.indexOf('scripts/verify-fullflow-neon-branch.mjs'))
      .toBeLessThan(source.indexOf('node_modules/vitest/vitest.mjs'));
    expect(readFileSync("scripts/verify-fullflow-schema.mjs", "utf8"))
      .toContain("await verifyFullFlowNeonBranch(url)");
  });

  it("does not hijack independent admissions, GF1 or curriculum acceptance targets", () => {
    for (const path of [
      "scripts/run-admissions-e2e.mjs", "playwright.config.ts",
      "playwright.admissions.config.ts", "playwright.curriculum.config.ts",
    ]) {
      expect(readFileSync(path, "utf8"), path)
        .not.toContain("scripts/verify-fullflow-neon-branch.mjs");
    }
    for (const path of [
      ".github/workflows/admissions-integration.yml",
      ".github/workflows/academic-intervention.yml",
      ".github/workflows/curriculum-browser-acceptance.yml",
    ]) {
      expect(readFileSync(path, "utf8"), path).toContain("run: npm run db:migrate");
      expect(readFileSync(path, "utf8"), path).not.toContain("db:migrate:fullflow");
    }
  });

  it("uses a database-attested branch check before the dedicated FullFlow migration wrapper", () => {
    const wrapper = readFileSync("scripts/migrate-fullflow-neon.mjs", "utf8");
    expect(wrapper).toContain("verifyFullFlowNeonBranch(testUrl)");
    expect(wrapper.indexOf("verifyFullFlowNeonBranch(testUrl)"))
      .toBeLessThan(wrapper.indexOf('["run", "db:migrate"]'));
    expect(wrapper).toContain('["scripts/review-fullflow-migrations.mjs"]');
    expect(wrapper.indexOf('["scripts/review-fullflow-migrations.mjs"]'))
      .toBeLessThan(wrapper.indexOf('["run", "db:migrate"]'));
  });
});

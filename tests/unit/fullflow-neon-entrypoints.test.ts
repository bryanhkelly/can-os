import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("FullFlow writable database entry points", () => {
  it("requires Neon branch attestation before every integration fixture", () => {
    const runner = readFileSync("scripts/run-integration-tests.mjs", "utf8");
    expect(runner).toContain("scripts/verify-fullflow-neon-branch.mjs");
    expect(runner.indexOf("scripts/verify-fullflow-neon-branch.mjs"))
      .toBeLessThan(runner.indexOf("node_modules/vitest/vitest.mjs"));
  });
  it("does not allow persistent browser fixtures to bypass branch verification", () => {
    const runner = readFileSync("scripts/run-admissions-e2e.mjs", "utf8");
    const configs = [
      "playwright.config.ts",
      "playwright.admissions.config.ts",
      "playwright.curriculum.config.ts",
    ];
    expect(runner).toContain("scripts/verify-fullflow-neon-branch.mjs");
    for (const path of configs) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain("scripts/verify-fullflow-neon-branch.mjs");
    }
    expect(readFileSync("playwright.config.ts", "utf8"))
      .toContain("reuseExistingServer: false");
  });
  it("routes CI migration steps through the branch-verified wrapper", () => {
    for (const path of [
      ".github/workflows/admissions-integration.yml",
      ".github/workflows/academic-intervention.yml",
      ".github/workflows/curriculum-browser-acceptance.yml",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain("npm run db:migrate:fullflow");
      expect(source, path).not.toMatch(/run:\s*npm run db:migrate\s*(?:\n|$)/);
    }
    const wrapper = readFileSync("scripts/migrate-fullflow-neon.mjs", "utf8");
    expect(wrapper).toContain("verifyFullFlowNeonBranch(testUrl)");
    expect(wrapper.indexOf("verifyFullFlowNeonBranch(testUrl)"))
      .toBeLessThan(wrapper.indexOf('["run", "db:migrate"]'));
  });
});

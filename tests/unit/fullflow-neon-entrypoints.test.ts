import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("FullFlow Neon branch isolation", () => {
  it("pins both FullFlow and Journey C to the dedicated database before test execution", () => {
    const source = readFileSync("scripts/run-integration-tests.mjs", "utf8").replace(/\r\n/g, "\n");
    expect(source).toContain('const requiresFullFlowDatabase = mode === "full-flow" || mode === "journey-c";');
    expect(source).toContain('if (requiresFullFlowDatabase) {\n  const branchCheck');
    expect(source).toContain('if (requiresFullFlowDatabase) {\n  const schema');
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

  it("runs the authenticated admissions browser journey after Neon integration", () => {
    const workflow = readFileSync(".github/workflows/admissions-integration.yml", "utf8");
    expect(workflow.indexOf("run: npm run test:integration:admissions"))
      .toBeLessThan(workflow.indexOf("run: npm run test:e2e:admissions"));
    expect(workflow).toContain("name: admissions-browser-failure");
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

  it("maps the Postgres migration ledger timestamp into the reviewer contract", () => {
    const reviewer = readFileSync("scripts/review-fullflow-migrations.mjs", "utf8");
    expect(reviewer).toContain("max(created_at) AS last_timestamp");
    expect(reviewer).toContain("...identity, ...ledger, lastTimestamp: ledger.last_timestamp, journal");
  });
});

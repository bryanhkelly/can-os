import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const script = "scripts/run-integration-tests.mjs";
const env = {
  ...process.env,
  NODE_ENV: "test",
  CAN_TEST_DB_WRITES_ENABLED: "true",
  TEST_DATABASE_URL: "postgresql://fullflow:synthetic@fullflow-disposable.example.test/fullflow",
  CAN_APPLICATION_DB_HOST: "main-application.example.test",
  DATABASE_URL: "",
};

describe("isolated FullFlow acceptance runner", () => {
  it("selects the continuous FullFlow integration suite, not denomination onboarding", () => {
    const source = readFileSync(script, "utf8");
    expect(source).toContain(
      'mode === "full-flow" ? ["tests/integration/full-flow.integration.test.ts", "tests/integration/program-site-authorization.integration.test.ts"]',
    );
    expect(source).toContain("tests/integration/full-flow.integration.test.ts");
    expect(source).toContain("tests/integration/program-site-authorization.integration.test.ts");
  });

  it("requires a database-attested Neon branch before launching any connected fixture", () => {
    const source = readFileSync(script, "utf8");
    expect(source).toContain('scripts/verify-fullflow-neon-branch.mjs');
    expect(source.indexOf('scripts/verify-fullflow-neon-branch.mjs'))
      .toBeLessThan(source.indexOf('node_modules/vitest/vitest.mjs'));
  });

  it("accepts the safe full-flow --preflight without contacting a database", () => {
    const outcome = spawnSync(process.execPath, [script, "full-flow", "--preflight"], {
      encoding: "utf8",
      env,
    });
    expect(outcome.status, outcome.stderr).toBe(0);
    expect(outcome.stdout).toContain("Disposable full-flow database endpoint check passed.");
  });

  it("refuses full-flow when the test endpoint matches the application endpoint", () => {
    const outcome = spawnSync(process.execPath, [script, "full-flow", "--preflight"], {
      encoding: "utf8",
      env: { ...env, CAN_APPLICATION_DB_HOST: "fullflow-disposable.example.test" },
    });
    expect(outcome.status).not.toBe(0);
    expect(outcome.stderr).toContain("must not use the configured application database host");
  });
});

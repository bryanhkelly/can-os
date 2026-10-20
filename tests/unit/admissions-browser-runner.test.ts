import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const application = "postgres://synthetic:synthetic@application.example.invalid/disposable";
const disposable = "postgres://synthetic:synthetic@test.example.invalid/disposable";
function preflight(overrides: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, ["scripts\\run-admissions-e2e.mjs", "--preflight"], {
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test", CAN_TEST_DB_WRITES_ENABLED: "true",
      DATABASE_URL: application, TEST_DATABASE_URL: disposable, CAN_APPLICATION_DB_HOST: "application.example.invalid",
      ...overrides },
  });
}

describe("Admissions browser disposable database guards", () => {
  it("permits preflight only on a distinct disposable endpoint without starting browsers", () => {
    const result = preflight();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Disposable admissions-offers database endpoint check passed.");
    expect(result.stdout).not.toContain("Running 1 test");
  });
  it.each([
    [{ NODE_ENV: "production" }, "never run fixtures in production"],
    [{ CAN_TEST_DB_WRITES_ENABLED: "false" }, "CAN_TEST_DB_WRITES_ENABLED=true"],
    [{ TEST_DATABASE_URL: "" }, "TEST_DATABASE_URL is required"],
    [{ TEST_DATABASE_URL: application }, "must not use the application database endpoint"],
    [{ TEST_DATABASE_URL: application.replace("@application.", "@application-pooler.") }, "must not use the application database endpoint"],
    [{ DATABASE_URL: "", CAN_APPLICATION_DB_HOST: "test-pooler.example.invalid" }, "must not use the configured application database host"],
    [{ DATABASE_URL: "", CAN_APPLICATION_DB_HOST: "" }, "production endpoint comparison"],
  ])("refuses unsafe browser fixture environment %j", (env, message) => {
    const result = preflight(env);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
  });
});

import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const runner = fileURLToPath(new URL("../../scripts/run-integration-tests.mjs", import.meta.url));

function run(environment: Record<string, string>) {
  return spawnSync(process.execPath, [runner], {
    cwd: tmpdir(),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:secret@ep-production.example/database",
      TEST_DATABASE_URL: "",
      CAN_TEST_DB_WRITES_ENABLED: "false",
      ...environment,
    },
  });
}

describe("isolated integration test runner", () => {
  it("requires explicit fixture-write approval", () => {
    const result = run({});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CAN_TEST_DB_WRITES_ENABLED");
    expect(result.stderr).not.toContain("secret");
  });

  it("never falls back to the application connection", () => {
    const result = run({ CAN_TEST_DB_WRITES_ENABLED: "true" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("TEST_DATABASE_URL is required");
  });

  it("rejects production mode", () => {
    const result = run({ NODE_ENV: "production" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("never run fixtures in production");
  });

  it("rejects pooled and direct connections to the application endpoint", () => {
    const result = run({
      CAN_TEST_DB_WRITES_ENABLED: "true",
      TEST_DATABASE_URL: "postgresql://other:secret@ep-production-pooler.example/other",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must not use the application database endpoint");
  });

  it.each(["not-a-url", "https://example.com"])("rejects invalid database connection %s", (url) => {
    const result = run({ CAN_TEST_DB_WRITES_ENABLED: "true", TEST_DATABASE_URL: url });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Integration tests refused");
    expect(result.stderr).not.toContain("secret");
  });
});

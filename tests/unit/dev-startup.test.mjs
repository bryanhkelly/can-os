import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { developmentEnvironment } from "../../scripts/dev.mjs";

let directory;
const key = "synthetic-dev-startup-key-at-least-32-characters";
const database = "postgresql://fixture:fixture@development.invalid/fixture";
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "can-os-dev-startup-")); });
afterEach(() => { rmSync(directory, { recursive: true }); });

describe("FullFlow development startup", () => {
  it("loads the checkout's local database and stable session key without login flags", () => {
    writeFileSync(join(directory, ".env.local"), `DATABASE_URL=${database}\nCAN_ACCESS_TOKEN_PEPPER=${key}\n`);
    const env = developmentEnvironment(directory, {});
    expect(env).toMatchObject({ DATABASE_URL: database, CAN_ACCESS_TOKEN_PEPPER: key, NODE_ENV: "development" });
    expect(env.CAN_DEMO_FIXED_ACCESS_ENABLED).toBeUndefined();
    expect(env.CAN_DEMO_PUBLIC_ACCESS_ENABLED).toBeUndefined();
    expect(developmentEnvironment(directory, {}).CAN_ACCESS_TOKEN_PEPPER).toBe(key);
  });
  it("preserves shell overrides instead of overwriting them from disk", () => {
    writeFileSync(join(directory, ".env.local"), "DATABASE_URL=postgresql://local.invalid/fixture\nCAN_ACCESS_TOKEN_PEPPER=short\n");
    expect(developmentEnvironment(directory, {
      DATABASE_URL: database, CAN_ACCESS_TOKEN_PEPPER: key, PATH: "fixture-path",
    })).toMatchObject({ DATABASE_URL: database, CAN_ACCESS_TOKEN_PEPPER: key, PATH: "fixture-path" });
  });
  it.each([
    [{ CAN_ACCESS_TOKEN_PEPPER: key }, "Configure DATABASE_URL"],
    [{ DATABASE_URL: database }, "Configure CAN_ACCESS_TOKEN_PEPPER"],
    [{ DATABASE_URL: database, CAN_ACCESS_TOKEN_PEPPER: "short" }, "at least 32 characters"],
    [{ DATABASE_URL: "secret-invalid-url", CAN_ACCESS_TOKEN_PEPPER: key }, "PostgreSQL connection URL"],
    [{ DATABASE_URL: "https://private.invalid", CAN_ACCESS_TOKEN_PEPPER: key }, "PostgreSQL connection URL"],
    [{ DATABASE_URL: database, CAN_ACCESS_TOKEN_PEPPER: key, NODE_ENV: "production" }, "must not run in production"],
  ])("refuses incomplete or unsafe configuration without leaking its values", (env, message) => {
    expect(() => developmentEnvironment(directory, env)).toThrow(message);
    try {
      developmentEnvironment(directory, env);
    } catch (error) {
      expect(error.message).not.toContain("secret-invalid-url");
      expect(error.message).not.toContain(key);
      expect(error.message).not.toContain(database);
    }
  });
});

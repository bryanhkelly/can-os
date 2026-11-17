import { defineConfig } from "@playwright/test";
import { requirePinnedReleaseUrl } from "./tests/e2e/config/guards";

/**
 * Deliberately does not start a development server. Only test a separately
 * deployed and verified nonproduction release from the current main commit.
 */
const baseURL = process.env.CAN_RELEASE_E2E_URL;
const sourceSha = process.env.CAN_RELEASE_SOURCE_SHA;
const deployedSha = process.env.CAN_RELEASE_DEPLOYED_SHA;
const url = requirePinnedReleaseUrl({
  baseURL, sourceSha, deployedSha, profile: "Canonical learning release",
});
const allowWrites = process.env.CAN_RELEASE_E2E_WRITES === "1";
if (allowWrites && !["localhost", "127.0.0.1"].includes(url.hostname) &&
    !url.hostname.includes("--")) {
  throw new Error("Refusing browser mutations on a production or non-preview hostname");
}
export default defineConfig({
  testDir: "./tests/e2e/live",
  testMatch: "canonical-learning-release.spec.ts",
  timeout: 60_000,
  expect: { timeout: 12_000 },
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});

import { defineConfig } from "@playwright/test";

/**
 * Deliberately does not start a development server. Only test a separately
 * deployed and verified nonproduction release from the current main commit.
 */
const baseURL = process.env.CAN_RELEASE_E2E_URL;
const sourceSha = process.env.CAN_RELEASE_SOURCE_SHA;
const deployedSha = process.env.CAN_RELEASE_DEPLOYED_SHA;
if (!baseURL) throw new Error("CAN_RELEASE_E2E_URL must name the deployed test site");
const url = new URL(baseURL);
if (!["https:", "http:"].includes(url.protocol)) throw new Error("Invalid test URL protocol");
if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))
  throw new Error("Release acceptance requires HTTPS or local loopback");
if (!sourceSha || !deployedSha || !/^[a-f0-9]{40}$/i.test(sourceSha) ||
    sourceSha !== deployedSha) {
  throw new Error("Release acceptance requires an exact verified Netlify deploy SHA matching source main");
}
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

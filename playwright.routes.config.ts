import { defineConfig } from "@playwright/test";
import { requireLocalHttpUrl } from "./tests/e2e/config/guards";

const baseURL = process.env.CAN_ROUTE_TEST_BASE_URL ?? "http://127.0.0.1:5173";
const target = requireLocalHttpUrl(baseURL, "Read-only route checks");

export default defineConfig({
  testDir: "./tests/e2e/read-only",
  outputDir: `./test-results-routes/${process.pid}`,
  timeout: 45_000,
  expect: { timeout: 20_000 },
  workers: 2,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
});

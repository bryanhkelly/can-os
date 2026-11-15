import { defineConfig } from "@playwright/test";

const targets = new Set([
  "https://can-os.bryanhkelly.workers.dev",
  "https://can-os-demo-new.netlify.app",
  "https://can-os-demo.netlify.app",
]);
const baseURL = process.env.CAN_LIVE_BASE_URL ?? "https://can-os.bryanhkelly.workers.dev";
if (!targets.has(baseURL)) {
  throw new Error("Live browser checks accept only explicitly approved CAN OS deployment hosts.");
}

export default defineConfig({
  testDir: "./tests/e2e/live",
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 2,
  retries: 0,
  outputDir: "./test-results-live",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report-live", open: "never" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-chromium",
      use: {
        browserName: "chromium", viewport: { width: 390, height: 844 },
        isMobile: true, hasTouch: true,
      },
    },
  ],
});

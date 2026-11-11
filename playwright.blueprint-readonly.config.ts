import { defineConfig } from "@playwright/test";
/** Isolated, read-only browser DOM acceptance: no Neon, no app server, no POST. */
export default defineConfig({
  testDir:"./tests/e2e/blueprint-readonly",
  timeout:45_000,
  expect:{timeout:10_000},
  fullyParallel:false,
  workers:1,
  retries:0,
  reporter:"list",
  use:{browserName:"chromium",trace:"retain-on-failure",screenshot:"only-on-failure"},
});

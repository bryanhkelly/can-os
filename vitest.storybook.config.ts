import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { fixtureIsolationPlugin } from "./.storybook/fixture-isolation-plugin";
import { storybookFixtureAliases } from "./.storybook/fixture-aliases";
import { storybookServerDependencyExclusions } from "./.storybook/fixture-dependencies";

export default defineConfig({
  envDir: false,
  envPrefix: "STORYBOOK_FIXTURE_",
  publicDir: false,
  plugins: [
    fixtureIsolationPlugin(),
    tailwindcss(),
    storybookTest({
      configDir: fileURLToPath(new URL("./.storybook", import.meta.url)),
    }),
  ],
  resolve: {
    alias: storybookFixtureAliases,
  },
  // Vitest may pre-bundle exports of installed application dependencies even
  // when no story imports them. TanStack Start server exports require the app
  // plugin and must not enter the browser optimizer.
  optimizeDeps: {
    exclude: storybookServerDependencyExclusions,
  },
  test: {
    deps: {
      optimizer: {
        client: {
          exclude: storybookServerDependencyExclusions,
        },
      },
    },
    name: "storybook",
    // Limit competing browser contexts and cold transforms on local runners.
    // Every test still runs; do not mask nondeterminism with retries.
    maxWorkers: 2,
    // Preserve complete structured failure evidence, not only the console tail.
    reporters: ["default", "json"],
    outputFile: { json: "acceptance-artifacts/storybook-interaction-results.json" },
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    setupFiles: ["./.storybook/vitest.setup.ts"],
    testTimeout: 30_000,
  },
});

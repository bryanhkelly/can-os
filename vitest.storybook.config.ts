import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { storybookFixtureAliases } from "./.storybook/fixture-aliases";

export default defineConfig({
  plugins: [
    tailwindcss(),
    storybookTest({
      configDir: fileURLToPath(new URL("./.storybook", import.meta.url)),
    }),
  ],
  resolve: {
    alias: storybookFixtureAliases,
  },
  test: {
    name: "storybook",
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

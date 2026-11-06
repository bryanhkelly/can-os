import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    tailwindcss(),
    storybookTest({
      configDir: fileURLToPath(new URL("./.storybook", import.meta.url)),
    }),
  ],
  resolve: {
    alias: {
      "@/modules/programs/launch-drafts.functions": fileURLToPath(new URL("./src/modules/programs/__mocks__/launch-drafts.functions.ts", import.meta.url)),
      "@/modules/profiles/student-self-profile.functions": fileURLToPath(new URL("./src/modules/profiles/__mocks__/student-self-profile.functions.ts", import.meta.url)),
      "@/modules/profiles/qualifications.functions": fileURLToPath(new URL("./src/modules/profiles/__mocks__/qualifications.functions.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
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

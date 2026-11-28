import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Independent Storybook browser specs require a built catalog and a browser.
    // Run them via test:storybook:browser; Node contracts have their own command.
    exclude: [...configDefaults.exclude, "scripts/storybook/**"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30_000,
  },
});

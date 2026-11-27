import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { engineeringInventoryPlugin } from "./.storybook/engineering-inventory.mjs";
import { fixtureIsolationPlugin } from "./.storybook/fixture-isolation-plugin";
import { storybookFixtureAliases } from "./.storybook/fixture-aliases";
import { storybookServerDependencyExclusions } from "./.storybook/fixture-dependencies";

// Storybook must not initialize the application SSR, deployment, or route plugins.
export default defineConfig({
  envDir: false, // Do not load the application's .env files into fixture builds.
  envPrefix: "STORYBOOK_FIXTURE_",
  build: { sourcemap: false },
  optimizeDeps: { exclude: storybookServerDependencyExclusions },
  publicDir: false, // Copy only explicitly reviewed staticDirs.
  plugins: [fixtureIsolationPlugin(), engineeringInventoryPlugin(), tailwindcss(), react()],
  resolve: {
    tsconfigPaths: true,
    alias: storybookFixtureAliases,
  },
});

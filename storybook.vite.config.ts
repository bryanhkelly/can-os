import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fixtureIsolationPlugin } from "./.storybook/fixture-isolation-plugin";
import { storybookFixtureAliases } from "./.storybook/fixture-aliases";

// Storybook must not initialize the application SSR, deployment, or route plugins.
export default defineConfig({
  envDir: false, // Do not load the application's .env files into fixture builds.
  envPrefix: "STORYBOOK_FIXTURE_",
  build: { sourcemap: false },
  publicDir: false, // Copy only explicitly reviewed staticDirs.
  plugins: [fixtureIsolationPlugin(), tailwindcss(), react()],
  resolve: {
    tsconfigPaths: true,
    alias: storybookFixtureAliases,
  },
});

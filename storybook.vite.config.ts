import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { storybookFixtureAliases } from "./.storybook/fixture-aliases";

// Storybook must not initialize the application SSR, deployment, or route plugins.
export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    tsconfigPaths: true,
    alias: storybookFixtureAliases,
  },
});

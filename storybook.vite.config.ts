import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Storybook must not initialize the application SSR, deployment, or route plugins.
export default defineConfig({
  plugins: [tsconfigPaths(), tailwindcss(), react()],
});

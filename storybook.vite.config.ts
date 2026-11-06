import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath, URL } from "node:url";

// Storybook must not initialize the application SSR, deployment, or route plugins.
export default defineConfig({
  plugins: [tsconfigPaths(), tailwindcss(), react()],
  resolve: {
    alias: {
      "@/modules/programs/launch-drafts.functions": fileURLToPath(new URL("./src/modules/programs/__mocks__/launch-drafts.functions.ts", import.meta.url)),
      "@/modules/profiles/student-self-profile.functions": fileURLToPath(new URL("./src/modules/profiles/__mocks__/student-self-profile.functions.ts", import.meta.url)),
      "@/modules/profiles/qualifications.functions": fileURLToPath(new URL("./src/modules/profiles/__mocks__/qualifications.functions.ts", import.meta.url)),
    },
  },
});

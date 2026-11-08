import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@/platform/photography/cloudflare-runtime.server",
        replacement: fileURLToPath(new URL("./src/platform/photography/cloudflare-runtime.binding.server.ts",import.meta.url)),
      },
    ],
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart(),
    react(),
  ],
});

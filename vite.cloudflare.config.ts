import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import { resolveBuildSourceRevision } from "./build-source-revision.ts";
import { fileURLToPath } from "node:url";

export default defineConfig({
  define: { __CAN_SOURCE_REVISION__: JSON.stringify(resolveBuildSourceRevision()) },
  resolve: {
    tsconfigPaths: true,
    alias: [
      {
        find: "@/platform/photography/cloudflare-runtime.server",
        replacement: fileURLToPath(new URL("./src/platform/photography/cloudflare-runtime.binding.server.ts",import.meta.url)),
      },
    ],
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    tanstackStart(),
    react(),
  ],
});

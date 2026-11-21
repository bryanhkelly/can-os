import { defineConfig } from "vite";
import { resolveBuildSourceRevision } from "./build-source-revision.ts";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import netlify from "@netlify/vite-plugin-tanstack-start";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  define: { __CAN_SOURCE_REVISION__: JSON.stringify(resolveBuildSourceRevision()) },
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart({
      router: {
        codeSplittingOptions: {
          defaultBehavior: [["loader"], ["component"], ["pendingComponent"], ["errorComponent"], ["notFoundComponent"]],
        },
      },
    }),
    netlify({ dev: { edgeFunctions: { enabled: false } } }),
    react(),
  ],
});

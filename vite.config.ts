import { defineConfig } from "vite";
import { resolveBuildSourceRevision } from "./build-source-revision.ts";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import netlify from "@netlify/vite-plugin-tanstack-start";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const buildTimestamp = new Date().toISOString();

export default defineConfig(({ command }) => ({
  define: {
    __CAN_SOURCE_REVISION__: JSON.stringify(resolveBuildSourceRevision()),
    __CAN_BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
    __CAN_BUILD_TARGET__: JSON.stringify(command === "serve" ? "local-development" : "netlify"),
  },
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
}));

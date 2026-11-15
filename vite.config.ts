import { defineConfig } from "vite";
import { resolveBuildSourceRevision } from "./build-source-revision";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import netlify from "@netlify/vite-plugin-tanstack-start";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  define: { __CAN_SOURCE_REVISION__: JSON.stringify(resolveBuildSourceRevision()) },
  plugins: [
    tsconfigPaths(),
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

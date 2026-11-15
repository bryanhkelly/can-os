import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { probeCanonicalAuthReader } from "@/modules/identity/canonical-command-context.server";
import {
  canonicalLearningRuntimeReady, facilitatedLearningRuntimeReady,
} from "@/modules/learning/canonical-learning-release.server";

/** Report verified restricted reader connectivity + projection execution, never
 * just environment string shape. Individual request authorization still applies. */
export const getCanonicalLearningReleaseAvailability = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    const configured = canonicalLearningRuntimeReady();
    const readerReady = configured && await probeCanonicalAuthReader();
    return {
      activity: readerReady,
      facilitated: readerReady && facilitatedLearningRuntimeReady(),
    };
  });

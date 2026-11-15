import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import {
  canonicalLearningRuntimeReady, facilitatedLearningRuntimeReady,
} from "@/modules/learning/canonical-learning-release.server";

/** Exposes only deploy readiness, never credentials, grants or session details.
 * With valid configuration, individual command permissions still apply. */
export const getCanonicalLearningReleaseAvailability = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    return {
      activity: canonicalLearningRuntimeReady(),
      facilitated: facilitatedLearningRuntimeReady(),
    };
  });

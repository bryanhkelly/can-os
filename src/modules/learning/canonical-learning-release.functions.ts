import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

/** Public capability booleans only; no principal, grant or session details. */
export const getCanonicalLearningReleaseAvailability = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    return {
      activity: process.env.CAN_CANONICAL_ACTIVITY_ENABLED === "true",
      facilitated: process.env.CAN_FACILITATED_LEARNING_ENABLED === "true",
    };
  });

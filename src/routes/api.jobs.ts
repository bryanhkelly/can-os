import { createFileRoute } from "@tanstack/react-router";
import { runScheduledJobs } from "@/workers/scheduled-jobs";
import { isAuthorizedJobRequest } from "@/lib/job-auth.server";

/**
 * Authenticated maintenance endpoint invoked by netlify/functions/scheduled-jobs.ts.
 * Fails closed: CAN_JOB_SECRET must be configured and presented as a header.
 */
export const Route = createFileRoute("/api/jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedJobRequest(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const result = await runScheduledJobs();
        return Response.json(result);
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { runScheduledJobs } from "@/workers/scheduled-jobs";

/**
 * Authenticated maintenance endpoint invoked by netlify/functions/scheduled-jobs.ts.
 * Fails closed: CAN_JOB_SECRET must be configured and presented as a header.
 */
export const Route = createFileRoute("/api/jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CAN_JOB_SECRET;
        if (!secret || request.headers.get("x-can-job-secret") !== secret) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const result = await runScheduledJobs();
        return Response.json(result);
      },
    },
  },
});

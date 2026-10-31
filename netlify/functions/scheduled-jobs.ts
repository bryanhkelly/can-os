/**
 * Netlify scheduled function: invokes the app's authenticated maintenance endpoint
 * (POST /api/jobs), which runs the GF1 missing-work sweep and the domain-event outbox.
 *
 * Configuration:
 * - URL is provided automatically by Netlify (the canonical site URL).
 * - CAN_JOB_SECRET must be set in the Netlify environment; the endpoint fails closed without it.
 */
export default async () => {
  const base = process.env.URL;
  const secret = process.env.CAN_JOB_SECRET;
  if (!base || !secret) {
    throw new Error("scheduled-jobs: URL and CAN_JOB_SECRET are required; scheduled maintenance was NOT executed");
  }
  const response = await fetch(`${base}/api/jobs`, {
    method: "POST",
    headers: { "x-can-job-secret": secret },
  });
  if (!response.ok) {
    throw new Error(`scheduled-jobs: /api/jobs responded ${response.status}`);
  }
  // Timestamped successful completion is monitorable independently of scheduler invocation.
  console.info("scheduled-jobs: completed", new Date().toISOString(), await response.text());
};

export const config = { schedule: "*/5 * * * *" };

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
    console.error("scheduled-jobs: URL or CAN_JOB_SECRET is not configured; skipping run");
    return;
  }
  const response = await fetch(`${base}/api/jobs`, {
    method: "POST",
    headers: { "x-can-job-secret": secret },
  });
  if (!response.ok) {
    throw new Error(`scheduled-jobs: /api/jobs responded ${response.status}`);
  }
  console.log("scheduled-jobs:", await response.text());
};

export const config = { schedule: "*/5 * * * *" };

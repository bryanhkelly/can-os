export async function invokeScheduledEndpoint(
  endpoint: string,
  jobLabel: string,
  operation: string,
) {
  const base = process.env.URL;
  const secret = process.env.CAN_JOB_SECRET;
  if (!base || !secret) {
    throw new Error(`${jobLabel}: URL and CAN_JOB_SECRET are required; ${operation} was NOT executed`);
  }

  const response = await fetch(new URL(endpoint, base), {
    method: "POST",
    headers: { "x-can-job-secret": secret },
  });
  if (!response.ok) {
    throw new Error(`${jobLabel}: ${endpoint} responded ${response.status}`);
  }
  console.info(`${jobLabel}: completed`, new Date().toISOString(), await response.text());
}
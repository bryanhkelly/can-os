/** The Site resolution and ACS profile queues use the same retry schedule.
 * Geography policy is independent of email and reporting delivery policies. */
export const GEOGRAPHIC_JOB_MAX_ATTEMPTS = 4;
export const GEOGRAPHIC_JOB_LEASE_SECONDS = 120;

export function geographicJobRetryStatus(attempts: number): "failed" | "pending" {
  return attempts >= GEOGRAPHIC_JOB_MAX_ATTEMPTS ? "failed" : "pending";
}

export function geographicJobRetryDelayMinutes(attempts: number): number {
  return Math.min(60, 2 ** attempts);
}

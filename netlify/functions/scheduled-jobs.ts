import { invokeScheduledEndpoint } from "../invoke-scheduled-endpoint";

/**
 * Netlify scheduled function: invokes the app's authenticated maintenance endpoint
 * (POST /api/jobs), which runs the GF1 missing-work sweep and the domain-event outbox.
 *
 * Configuration:
 * - URL is provided automatically by Netlify (the canonical site URL).
 * - CAN_JOB_SECRET must be set in the Netlify environment; the endpoint fails closed without it.
 */
export default () => invokeScheduledEndpoint("/api/jobs", "scheduled-jobs", "scheduled maintenance");

export const config = { schedule: "*/5 * * * *" };

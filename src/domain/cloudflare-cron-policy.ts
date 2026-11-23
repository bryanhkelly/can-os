/**
 * Cloudflare's minute tick is needed for the R2-based photo pipeline.
 * Database-backed mail dispatch is less frequent so Neon can scale to zero.
 * Security metadata retention needs only a daily lease attempt.
 *
 * These expressions must match wrangler.jsonc. Keep a fail-closed fallback:
 * an unexpected cron expression must not launch database work.
 */
export const cloudflareCronSchedules = {
  photography: "* * * * *",
  deliveries: "*/15 * * * *",
  retention: "0 3 * * *",
} as const;

export type CloudflareCronTask = keyof typeof cloudflareCronSchedules;

export function classifyCloudflareCron(cron: string | undefined): CloudflareCronTask | null {
  if (cron === cloudflareCronSchedules.photography) return "photography";
  if (cron === cloudflareCronSchedules.deliveries) return "deliveries";
  if (cron === cloudflareCronSchedules.retention) return "retention";
  return null;
}

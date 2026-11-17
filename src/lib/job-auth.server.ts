import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time authorization check for shared cron/job endpoints.
 * Fails closed when CAN_JOB_SECRET is unset, so a misconfigured deploy
 * cannot be invoked. Digests are compared so secret length is not leaked
 * through early-exit timing.
 */
export function isAuthorizedJobRequest(request: Request): boolean {
  const expected = process.env.CAN_JOB_SECRET;
  const presented = request.headers.get("x-can-job-secret");
  if (!expected || !presented) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(presented), digest(expected));
}

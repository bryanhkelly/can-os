/** Workerd exposes WebSocketPair; pooled Neon WebSockets are request-local.
 * The Node/Netlify runtime deliberately retains a reusable fallback pool.
 */
export function isCloudflareWorkerRuntime(): boolean {
  return Reflect.has(globalThis, "WebSocketPair");
}

export function assertUnscopedDatabaseAllowed(workerRuntime: boolean): void {
  if (workerRuntime) {
    throw new Error("Cloudflare database access requires withRequestDatabase");
  }
}

export function cloudflareIngressConfiguration(
  workerRuntime: boolean,
  hasRequestLimiter: boolean,
  hasVerificationLimiter: boolean,
): "node" | "cloudflare" | "misconfigured_worker" {
  if (!workerRuntime) return "node";
  return hasRequestLimiter && hasVerificationLimiter
    ? "cloudflare" : "misconfigured_worker";
}

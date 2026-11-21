/**
 * Opt-in, low-cardinality server timing for CAN OS page-loading investigations.
 *
 * Set CAN_PERF_TRACE=1 in the server environment to emit one timing per step.
 * Labels must be hard-coded constants: never use paths with IDs, request URLs,
 * SQL text, record counts, email addresses or other tenant/private values.
 * Do not cache, serialize or return timings to clients.
 */
export async function measureServerStep<T>(
  route: string,
  step: string,
  operation: () => Promise<T>,
): Promise<T> {
  // Router loaders can also execute during client-side navigation.
  if (typeof process === "undefined" || process.env.CAN_PERF_TRACE !== "1") return operation();
  const startedAt = Date.now();
  let status: "ok" | "error" = "ok";
  try {
    return await operation();
  } catch (error) {
    status = "error";
    throw error;
  } finally {
    console.info("[can-perf]", JSON.stringify({
      route,
      step,
      status,
      elapsedMs: Date.now() - startedAt,
    }));
  }
}

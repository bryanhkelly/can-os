/** Shared transport policy across independent, source-owned outbound queues.
 * This does not change the source of truth or collapse unrelated outbox tables.
 * Provider acceptance remains distinct from a confirmed delivery receipt.
 */
export const OUTBOUND_LEASE_MS=120_000;
export const OUTBOUND_MAX_ATTEMPTS=5;
/** Backoff: 1, 2, 4 ... minutes, capped at one hour. */
export function outboundRetryDelayMs(attempt:number):number {
 return Math.min(60_000*2**Math.max(0,attempt-1),3_600_000);
}

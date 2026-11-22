/**
 * Fixed, bounded retry schedule for reportable source projection failures.
 * Failure details are never copied from an event into reporting receipts.
 */
export function reportingProjectionRetryDelayMs(attempts: number): number {
  if (!Number.isSafeInteger(attempts) || attempts < 1) {
    throw new Error("Invalid reporting projection retry attempt");
  }
  return Math.min(5 * 60_000 * 2 ** Math.min(attempts - 1, 9), 24 * 60 * 60_000);
}

// A terminal dead letter requires an independently authorized source correction,
// not silent deletion or mutation of immutable receipts.
export const MAX_REPORTING_PROJECTION_ATTEMPTS = 5;
export function reportingProjectionFailureState(
  attempts: number,
): "retry_pending" | "dead_letter" {
  if (!Number.isSafeInteger(attempts) || attempts < 1) {
    throw new Error("Invalid reporting projection attempt count");
  }
  return attempts >= MAX_REPORTING_PROJECTION_ATTEMPTS
    ? "dead_letter" : "retry_pending";
}

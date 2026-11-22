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

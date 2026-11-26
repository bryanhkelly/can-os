const DAY_MS = 86_400_000;

/** Validate a closed, positive reporting period without changing its time basis. */
export function parseClosedReportingWindow(
  selection: { from: string; to: string },
  asOf: Date,
  errorMessage: string,
): { from: Date; to: Date } {
  const from = new Date(selection.from);
  const to = new Date(selection.to);
  const start = from.getTime();
  const end = to.getTime();
  const cutoff = asOf.getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) ||
      !Number.isFinite(cutoff) || end <= start || end > cutoff ||
      end - start > 90 * DAY_MS) {
    throw new Error(errorMessage);
  }

  return { from, to };
}

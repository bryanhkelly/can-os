/** A date-only planning value; it never conveys opening authorization. */
export function isLaunchOpeningDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1 || year > 9998) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function launchOpeningDate(metadata: Record<string, unknown>): string | undefined {
  return isLaunchOpeningDate(metadata.targetOpeningDate) ? metadata.targetOpeningDate : undefined;
}


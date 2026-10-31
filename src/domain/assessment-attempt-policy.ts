/** Limits use the canonical Assessment metadata. An omitted limit preserves
 * teacher-authorized revision behavior; it never grants automatic retries.
 */
export const MAX_ASSESSMENT_ATTEMPTS = 100;

export function assessmentAttemptLimit(metadata: Record<string, unknown> | null | undefined): number | null {
  const value = metadata?.maxAttempts;
  if (value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) ||
      value < 1 || value > MAX_ASSESSMENT_ATTEMPTS)
    throw new Error("This assessment has an invalid attempt limit");
  return value;
}

export function assertAssessmentAttemptAllowed(metadata: Record<string, unknown> | null | undefined, attempt: number): void {
  const limit = assessmentAttemptLimit(metadata);
  if (!Number.isSafeInteger(attempt) || attempt < 1)
    throw new Error("Invalid submission attempt");
  if (limit !== null && attempt > limit)
    throw new Error("This assignment's attempt limit has been reached");
}

/** Guardian-facing grades are released only after teacher grading. */
export function guardianFeedbackReleased(status: string | null): boolean {
 return status === "graded" || status === "returned";
}

/** Select the latest recorded attempt per assessment without leaking older drafts. */
export function latestGuardianAttempts<T extends { assessmentId: string; attemptNumber: number | null }>(rows: readonly T[]): T[] {
 const latest = new Map<string,T>();
 for (const row of rows) {
  const prior = latest.get(row.assessmentId);
  if (!prior || (row.attemptNumber ?? 0) > (prior.attemptNumber ?? 0))
   latest.set(row.assessmentId,row);
 }
 return [...latest.values()];
}

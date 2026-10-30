/**
 * Academic credit cannot be inferred from a course title, grade or elapsed
 * classroom time. Unknown credits must never silently become 1 unit.
 */
export function verifiedSectionCreditUnits(metadata: Record<string,unknown>): number|null {
  const value=metadata.credits;
  if(typeof value!=="number"||!Number.isFinite(value)||
    value<=0||value>10||Math.abs(Math.round(value*100)-value*100)>1e-8) return null;
  return value;
}

/**
 * A transcript reflects what the school has recorded; it does not certify
 * graduation. Missing credits are disclosed, never imputed and never used as
 * an issuance eligibility gate. This is informational evidence only.
 *
 * Diploma/graduation eligibility is a separate institution-approved decision,
 * which must validate earned credits against explicit graduation requirements.
 */
export function countTranscriptRowsWithUnrecordedCredits(rows: readonly {
  creditConfigured?: boolean;
  creditsAttempted?: number | null;
  creditsEarned?: number | null;
  terminalPeriod?: boolean;
}[]): number {
  return rows.filter(row =>
    // Interim grading periods are reported, not separate credit awards.
    row.terminalPeriod !== false && (
    row.creditConfigured === false ||
    row.creditsAttempted == null ||
    row.creditsEarned == null),
  ).length;
}

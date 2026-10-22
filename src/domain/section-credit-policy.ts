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

export function requireKnownTranscriptCredits(rows:readonly {
  creditConfigured:boolean;
  creditsAttempted:number|null;
  creditsEarned:number|null;
}[]):void {
  if(rows.some(r=>!r.creditConfigured||r.creditsAttempted===null||r.creditsEarned===null))
    throw new Error("Official transcript issuance requires explicitly configured credit units for every included course");
}

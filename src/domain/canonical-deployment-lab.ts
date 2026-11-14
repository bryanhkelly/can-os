/** Presentation diagnostics, never a substitute for the canonical approval/activation gate. */
export function currentApprovedAdoption<T extends {
  approvalStatus: string;
  validFrom: Date;
  validThrough: Date | null;
  lifecycle: string;
}>(adoptions: readonly T[], now: Date): T | null {
  return [...adoptions].filter(row =>
    row.approvalStatus === "approved" &&
    row.lifecycle === "published" &&
    row.validFrom <= now &&
    (row.validThrough === null || row.validThrough > now),
  ).sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime())[0] ?? null;
}

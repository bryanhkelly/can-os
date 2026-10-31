/**
 * A graduation audit is advisory until an authorized institution approves a
 * versioned requirement set and records a separate graduation decision.
 * Unknown or duplicate credit evidence must never produce an eligible result.
 */
export type CreditRequirement = {
  subject: string;
  minimumUnits: number;
};
export type CreditEvidence = {
  sectionId: string;
  subject: string;
  earnedUnits: number | null;
  finalized: boolean;
  acceptedByIssuer: boolean;
};
export type CreditAuditResult = {
  status: "requirements_met" | "deficient" | "incomplete";
  totalEarned: number;
  deficiencies: Array<{subject: string; required: number; earned: number; missing: number}>;
  blockers: string[];
};

const validUnits = (value: number): boolean =>
  Number.isFinite(value) && value >= 0 && Math.round(value * 100) === value * 100;

/**
 * Fail closed on missing, unapproved, or inconsistent records. Only distinct,
 * finalized, issuer-accepted sections count; transfer work needs explicit
 * issuer acceptance. This does not award a diploma or confer graduation.
 */
export function auditGraduationCredits(
  requirements: readonly CreditRequirement[],
  evidence: readonly CreditEvidence[],
): CreditAuditResult {
  const blockers: string[] = [];
  if (!requirements.length) blockers.push("No approved graduation requirements supplied");
  const required = new Map<string, number>();
  const subjectNames = new Map<string,string>();
  for (const rule of requirements) {
    const subject = rule.subject.trim();
    const key = subject.toLocaleLowerCase();
    if (!subject || !validUnits(rule.minimumUnits) || rule.minimumUnits <= 0 ||
        required.has(key)) {
      blockers.push(`Invalid or duplicate graduation requirement: ${rule.subject}`);
      continue;
    }
    required.set(key, rule.minimumUnits);
    subjectNames.set(key,subject);
  }
  const earned = new Map<string, number>();
  const seen = new Set<string>();
  for (const row of evidence) {
    if (!row.sectionId || seen.has(row.sectionId)) {
      blockers.push(`Missing or duplicate section evidence: ${row.sectionId}`);
      continue;
    }
    seen.add(row.sectionId);
    if (!row.finalized || !row.acceptedByIssuer || row.earnedUnits === null ||
        !validUnits(row.earnedUnits) || !row.subject.trim()) {
      blockers.push(`Unverified credit evidence: ${row.sectionId}`);
      continue;
    }
    const key=row.subject.trim().toLocaleLowerCase();
    earned.set(key, (earned.get(key) ?? 0) + row.earnedUnits);
  }
  const deficiencies = [...required].map(([subject, minimumUnits]) => ({
    subject:subjectNames.get(subject)??subject, required: minimumUnits, earned: earned.get(subject) ?? 0,
    missing: Math.max(0, minimumUnits - (earned.get(subject) ?? 0)),
  })).filter(row => row.missing > 0);
  return {
    status: blockers.length ? "incomplete" : deficiencies.length ? "deficient" : "requirements_met",
    totalEarned: [...earned.values()].reduce((sum, units) => sum + units, 0),
    deficiencies,
    blockers,
  };
}

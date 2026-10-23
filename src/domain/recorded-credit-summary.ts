/**
 * Read-only, source-bound credit inventory assembled from the existing
 * transcript projection. NOT a graduation audit or an award of credit.
 *
 * Only a FINAL term-period grade (or explicit approved withdrawal notation)
 * can contribute to the inventory. Earlier grading periods count zero.
 * Issuing institutions never have their records silently combined.
 */
export type RecordedCreditRow = {
  sectionGradeId: string;
  sectionId: string;
  termId: string;
  creditIssuingOrganizationId: string;
  creditIssuingOrganization: string;
  subject?: string | null;
  letterGrade: string | null;
  terminalPeriod?: boolean;
  creditConfigured?: boolean;
  creditsAttempted?: number | null;
  creditsEarned?: number | null;
};

export type CreditSubjectSummary = {
  subject: string;
  attemptedUnits: number;
  earnedUnits: number;
  incompleteEntries: number;
  withdrawals: number;
};

export type CreditIssuerSummary = {
  issuerId: string;
  issuerName: string;
  subjects: CreditSubjectSummary[];
  attemptedUnits: number;
  earnedUnits: number;
  incompleteEntries: number;
  conflictingEntries: number;
  withdrawals: number;
};

function validUnits(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) &&
    value >= 0 && value <= 10 && Math.abs(Math.round(value * 100) - value * 100) < 1e-8;
}

/**
 * Count a section's credit only once per term and issuer; a duplicate terminal
 * or withdrawal record is flagged for human review, never summed twice.
 */
export function summarizeRecordedTranscriptCredits(rows: readonly RecordedCreditRow[]) {
  const issuers = new Map<string, CreditIssuerSummary>();
  const seenGradeRows = new Set<string>();
  const terminalEntries = new Map<string, RecordedCreditRow[]>();

  for (const row of rows) {
    if (!row.sectionGradeId || seenGradeRows.has(row.sectionGradeId)) continue;
    seenGradeRows.add(row.sectionGradeId);
    if (!row.terminalPeriod) continue;

    const issuerId = row.creditIssuingOrganizationId;
    if (!issuerId || !row.sectionId || !row.termId) {
      throw new Error("Transcript row has no credit source / section / term");
    }
    if (!issuers.has(issuerId)) {
      issuers.set(issuerId, {
        issuerId, issuerName: row.creditIssuingOrganization,
        subjects: [], attemptedUnits: 0, earnedUnits: 0,
        incompleteEntries: 0, conflictingEntries: 0, withdrawals: 0,
      });
    }
    const key = JSON.stringify([issuerId, row.sectionId, row.termId]);
    const existing = terminalEntries.get(key) ?? [];
    existing.push(row);
    terminalEntries.set(key, existing);
  }

  const subjects = new Map<string, Map<string, CreditSubjectSummary>>();
  for (const entries of terminalEntries.values()) {
    const first = entries[0]!;
    const issuer = issuers.get(first.creditIssuingOrganizationId)!;
    const subjectName = first.subject?.trim() || "Uncategorized — review needed";
    const sourceSubjects = subjects.get(issuer.issuerId) ?? new Map<string, CreditSubjectSummary>();
    subjects.set(issuer.issuerId, sourceSubjects);
    const subject = sourceSubjects.get(subjectName) ?? {
      subject: subjectName, attemptedUnits: 0, earnedUnits: 0,
      incompleteEntries: 0, withdrawals: 0,
    };
    sourceSubjects.set(subjectName, subject);
    if (entries.length > 1) {
      issuer.conflictingEntries += 1;
      issuer.incompleteEntries += 1;
      subject.incompleteEntries += 1;
      continue;
    }
    const withdrawn = first.letterGrade === "W";
    if (withdrawn) {
      issuer.withdrawals += 1;
      subject.withdrawals += 1;
    }
    const attempted = first.creditsAttempted;
    const earned = first.creditsEarned;
    if (first.creditConfigured === false || !validUnits(attempted) ||
        !validUnits(earned) || earned > attempted ||
        (withdrawn && earned !== 0)) {
      issuer.incompleteEntries += 1;
      subject.incompleteEntries += 1;
      continue;
    }
    // Integer hundredths avoid precision drift in otherwise valid units.
    issuer.attemptedUnits = (Math.round(issuer.attemptedUnits * 100) + Math.round(attempted * 100)) / 100;
    issuer.earnedUnits = (Math.round(issuer.earnedUnits * 100) + Math.round(earned * 100)) / 100;
    subject.attemptedUnits = (Math.round(subject.attemptedUnits * 100) + Math.round(attempted * 100)) / 100;
    subject.earnedUnits = (Math.round(subject.earnedUnits * 100) + Math.round(earned * 100)) / 100;
  }

  const byIssuer = [...issuers.values()].map(issuer => ({
    ...issuer,
    subjects: [...(subjects.get(issuer.issuerId)?.values() ?? [])]
      .sort((a, b) => a.subject.localeCompare(b.subject)),
  })).sort((a, b) => a.issuerName.localeCompare(b.issuerName));
  return {
    byIssuer,
    incompleteEntries: byIssuer.reduce((n, issuer) => n + issuer.incompleteEntries, 0),
    conflictingEntries: byIssuer.reduce((n, issuer) => n + issuer.conflictingEntries, 0),
    graduationStatus: "not_evaluated" as const,
    diplomaAuthorized: false as const,
    note: "Recorded credits are grouped by their issuing institution and course subject. Missing or conflicting evidence needs school review. Transfer approval, cohort graduation requirements and diploma eligibility are NOT evaluated. Transcript issuance is independent of these checks.",
  };
}

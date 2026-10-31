import { summarizeRecordedTranscriptCredits } from "@/domain/recorded-credit-summary";

export type ReportCardGrade = {
  sectionId?: string;
  termId?: string;
  creditIssuingOrganizationId?: string;
  subject?: string | null;
  terminalPeriod?: boolean;
  sectionGradeId: string;
  sectionTitle: string;
  letterGrade: string | null;
  creditsAttempted?:number|null;
  creditsEarned?:number|null;
  creditConfigured?:boolean;
  percentage: string | null;
  score: string | null;
  gradingPeriodName: string;
  termName: string;
  schoolYearName: string;
  programName: string | null;
  creditIssuingOrganization: string | null;
};

export type TranscriptIssuanceSummary = {
  id: string;
  issuedAt: string;
  purpose: string | null;
  issuingOrganization: string;
};

function groupBy<T>(items: T[], keyOf: (item: T) => string): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()];
}

function percentageLabel(percentage: string | null): string {
  if (percentage === null) return "—";
  const value = Number(percentage);
  return Number.isFinite(value) ? `${value}%` : percentage;
}

/** Finalized grades grouped by school year / term / grading period. */
export function ReportCardView({ grades }: { grades: ReportCardGrade[] }) {
  if (!grades.length) {
    return <p className="mt-8 text-sm">No finalized grades yet for this grading period.</p>;
  }
  return (
    <div className="mt-8 grid gap-6">
      {groupBy(grades, grade => `${grade.schoolYearName} · ${grade.termName} · ${grade.gradingPeriodName}`).map(([period, periodGrades]) => (
        <section key={period}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{period}</h2>
          <div className="mt-3 grid gap-4">
            {periodGrades.map(grade => (
              <div key={grade.sectionGradeId} className="rounded-xl border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">{grade.sectionTitle}</h3>
                    {grade.creditIssuingOrganization && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {grade.programName ? `${grade.programName} · ` : ""}Academic record issuer: {grade.creditIssuingOrganization}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold">{grade.letterGrade ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{percentageLabel(grade.percentage)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Durable transcript view regenerated from finalized section grades. */
export function TranscriptView({
  rows,
  issuances,
}: {
  rows: ReportCardGrade[];
  issuances: TranscriptIssuanceSummary[];
}) {
  return (
    <div className="mt-6">
      <h2 className="font-serif text-2xl">Transcript</h2>
      <RecordedCreditInventory rows={rows} />
      <p className="mt-2 text-xs text-muted-foreground">Official academic history. Missing credits appear as Not recorded and do not prevent transcript issuance. A transcript does not certify graduation or confer a diploma.</p>
      {!rows.length && <p className="mt-4 text-sm">No finalized grades on record yet.</p>}
      {groupBy(rows, row => row.schoolYearName).map(([year, yearRows]) => (
        <section key={year} className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{year}</h3>
          {groupBy(yearRows, row => row.termName).map(([term, termRows]) => (
            <div key={term} className="mt-3 rounded-xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{term}</p>
              <ul className="mt-3 divide-y">
                {termRows.map(row => (
                  <li key={row.sectionGradeId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-semibold">{row.sectionTitle}</p>
                      {row.creditIssuingOrganization && (
                        <p className="text-xs text-muted-foreground">Academic record issuer: {row.creditIssuingOrganization}</p>
                      )}
                    </div>
                    <p className="text-sm font-semibold">
                      {row.letterGrade ?? "—"} <span className="ml-2 text-xs font-normal text-muted-foreground">{percentageLabel(row.percentage)}</span>
                      {typeof row.creditsEarned==="number" && <span className="ml-2 text-xs font-normal text-muted-foreground">{row.creditsEarned}/{row.creditsAttempted??0} credits earned</span>}
                      {(row.creditConfigured===false || row.creditsEarned === null || row.creditsAttempted === null) && <span className="ml-2 text-xs font-normal text-muted-foreground" role="status">Credits: Not recorded</span>}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
      {issuances.length > 0 && (
        <section className="mt-8">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Official issuances</h3>
          <div className="mt-3 grid gap-3">
            {issuances.map(issuance => (
              <div key={issuance.id} className="rounded-xl border bg-card p-4 text-sm">
                <p className="font-semibold">Issued by {issuance.issuingOrganization}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(issuance.issuedAt).toLocaleString()}
                  {issuance.purpose ? ` · ${issuance.purpose}` : ""}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}


/**
 * Informational inventory only. Requirements, transfer equivalencies,
 * diplomas and graduation authority live outside the transcript reader.
 */
export function RecordedCreditInventory({ rows }: { rows: ReportCardGrade[] }) {
  if (!rows.length) return null;
  if (rows.some(row => !row.sectionId || !row.termId || !row.creditIssuingOrganizationId)) {
    return <section className="mt-5 rounded-lg border p-4" aria-label="Recorded credit inventory">
      <h3 className="font-semibold">Recorded credits by subject</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        This transcript record lacks the provenance needed to calculate a reliable credit summary.
        The original course and grade entries remain available below.
      </p>
    </section>;
  }
  const inventory = summarizeRecordedTranscriptCredits(rows.map(row => ({
    sectionGradeId: row.sectionGradeId,
    sectionId: row.sectionId!,
    termId: row.termId!,
    creditIssuingOrganizationId: row.creditIssuingOrganizationId!,
    creditIssuingOrganization: row.creditIssuingOrganization ?? "Unknown issuing organization",
    subject: row.subject,
    letterGrade: row.letterGrade,
    terminalPeriod: row.terminalPeriod,
    creditConfigured: row.creditConfigured,
    creditsAttempted: row.creditsAttempted,
    creditsEarned: row.creditsEarned,
  })));
  return <section className="mt-5 rounded-lg border p-4" aria-label="Recorded credit inventory">
    <h3 className="font-semibold">Recorded credits by subject</h3>
    <p className="mt-1 text-xs text-muted-foreground">
      Informational summary of finalized academic records, kept separate by issuing institution.
      It is not an official graduation audit and does not establish diploma eligibility.
    </p>
    {!inventory.byIssuer.length &&
      <p className="mt-3 text-sm">No terminal grading-period credit entries are recorded yet.</p>}
    {inventory.byIssuer.map(issuer => <div key={issuer.issuerId} className="mt-4">
      <h4 className="font-semibold">{issuer.issuerName}</h4>
      <p className="mt-1 text-sm">Recorded earned: {issuer.earnedUnits} units · attempted: {issuer.attemptedUnits} units</p>
      <ul className="mt-2 divide-y">
        {issuer.subjects.map(item => <li className="flex flex-wrap justify-between gap-3 py-2 text-sm"
          key={item.subject}>
          <span>{item.subject}</span>
          <span>{item.earnedUnits} earned / {item.attemptedUnits} attempted
            {item.incompleteEntries ? ` · ${item.incompleteEntries} to review` : ""}
            {item.withdrawals ? ` · ${item.withdrawals} W` : ""}
          </span>
        </li>)}
      </ul>
      {issuer.conflictingEntries > 0 && <p role="status" className="mt-2 text-sm">
        {issuer.conflictingEntries} conflicting course/term records require academic review.
      </p>}
    </div>)}
    {inventory.incompleteEntries > 0 && <p className="mt-3 text-sm" role="status">
      {inventory.incompleteEntries} credit entries require review. Unknown credits are never assumed earned.
    </p>}
    <p className="mt-3 text-xs text-muted-foreground">{inventory.note}</p>
  </section>;
}

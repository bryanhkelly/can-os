export type ReportCardGrade = {
  sectionGradeId: string;
  sectionTitle: string;
  letterGrade: string | null;
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
                        {grade.programName ? `${grade.programName} · ` : ""}Credit issued by {grade.creditIssuingOrganization}
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
                        <p className="text-xs text-muted-foreground">Credit issued by {row.creditIssuingOrganization}</p>
                      )}
                    </div>
                    <p className="text-sm font-semibold">
                      {row.letterGrade ?? "—"} <span className="ml-2 text-xs font-normal text-muted-foreground">{percentageLabel(row.percentage)}</span>
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

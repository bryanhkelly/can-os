/**
 * Grade-scale passing policy. A school's versioned GradeScale decides which
 * letter grades are passing; the fallback list applies only when a grade
 * carries no scale at all. Never hard-code passing rules at call sites —
 * jurisdiction/school policy belongs in configuration (see docs/domain-model).
 */
export type GradeScaleConfiguration = {
  entries?: Array<{ label?: string; passing?: boolean }>;
};

/** Used only when a finalized grade has no linked grade scale. */
export const FALLBACK_PASSING_GRADES: readonly string[] = [
  "A",
  "B",
  "C",
  "D",
  "P",
  "Pass",
];

/**
 * Passing labels for a linked scale, or null when there is no scale. A linked
 * scale with an entry list is authoritative: if no
 * entry is flagged `passing`, every listed label passes; an empty entry list
 * passes nothing.
 */
export function passingGradeLabels(
  configuration: GradeScaleConfiguration | null | undefined,
): Set<string> | null {
  if (configuration == null) return null;
  if (!Array.isArray(configuration.entries)) throw new Error("Grade scale entries are required");
  const entries = configuration.entries;
  const flagged = entries.some((entry) => typeof entry.passing === "boolean");
  return new Set(
    (flagged ? entries.filter((entry) => entry.passing === true) : entries)
      .map((entry) => entry.label)
      .filter((label): label is string => typeof label === "string"),
  );
}

export function isPassingGrade(
  letterGrade: string | null | undefined,
  configuration: GradeScaleConfiguration | null | undefined,
): boolean {
  const passing = passingGradeLabels(configuration);
  if (passing) return passing.has(letterGrade ?? "");
  return FALLBACK_PASSING_GRADES.includes(letterGrade ?? "");
}

export type GradeBand = { label: string; minPercent?: number; maxPercent?: number };

export function gradeLabelForPercentage(percentage: number, entries: readonly GradeBand[]): string {
  if (!Number.isFinite(percentage)) throw new Error("Grade percentage must be finite");
  if (!entries.length) throw new Error("School grading scale has no entries");
  for (const entry of entries) {
    const min = entry.minPercent ?? 0;
    const max = entry.maxPercent ?? 100;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max || !entry.label.trim()) {
      throw new Error("School grading scale has an invalid band");
    }
  }
  const matched = entries.find(entry =>
    percentage >= (entry.minPercent ?? 0) && percentage <= (entry.maxPercent ?? 100));
  if (matched) return matched.label;
  const top = entries.reduce((highest, entry) =>
    (entry.maxPercent ?? 100) > (highest.maxPercent ?? 100) ? entry : highest);
  // Extra credit retains its percentage and earns the top configured grade.
  if (percentage > 100 && (top.maxPercent ?? 100) >= 100 && percentage > (top.maxPercent ?? 100)) {
    return top.label;
  }
  throw new Error("Grade percentage is outside the school grading scale");
}

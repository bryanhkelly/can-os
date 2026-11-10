export type SectionGradeEvidenceInput = {
  id: string;
  assessmentId: string;
  title: string;
  attemptNumber: number;
  status: string;
  score: string | null;
};

export type SectionGradeEvidence = ReturnType<typeof buildSectionGradeEvidence>;

export function buildSectionGradeEvidence(
  rows: readonly SectionGradeEvidenceInput[],
  pointsByAssessment: ReadonlyMap<string, number>,
) {
  return {
    method: "graded-assessment-points-ratio" as const,
    assessments: rows
      .filter(row => row.status === "graded" && row.score !== null &&
        (pointsByAssessment.get(row.assessmentId) ?? 0) > 0)
      .map(row => ({
        assessmentId: row.assessmentId,
        title: row.title,
        submissionId: row.id,
        attemptNumber: row.attemptNumber,
        score: row.score!,
        pointsPossible: pointsByAssessment.get(row.assessmentId)!,
      }))
      .sort((left, right) => left.assessmentId.localeCompare(right.assessmentId)),
  };
}

export function readSectionGradeEvidence(value: unknown): SectionGradeEvidence | null {
  if (!value || typeof value !== "object") return null;
  const evidence = value as { method?: unknown; assessments?: unknown };
  if (evidence.method !== "graded-assessment-points-ratio" || !Array.isArray(evidence.assessments)) return null;
  const assessments = evidence.assessments.filter((item): item is SectionGradeEvidence["assessments"][number] =>
    Boolean(item && typeof item === "object" &&
      typeof item.assessmentId === "string" && typeof item.title === "string" &&
      typeof item.submissionId === "string" && Number.isInteger(item.attemptNumber) &&
      typeof item.score === "string" && Number.isFinite(item.pointsPossible) && item.pointsPossible > 0));
  return { method: "graded-assessment-points-ratio", assessments };
}
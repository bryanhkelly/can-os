import { scoreRubric, type CriterionGrade, type RubricCriterion } from "@/modules/learning/rubric";

export type TeacherGradeInput = {
  pointsPossible: string | number | null | undefined;
  rubric: readonly RubricCriterion[];
  score: string;
  rubricInputs: Readonly<Record<string, string>>;
};

export type TeacherGradeValidation =
  | { valid: true; earned: number; grading: { score: number; rubricScores?: never } | { rubricScores: CriterionGrade[]; score?: never } }
  | { valid: false; message: string };

/** Client-side guidance matching the existing authoritative gradeSubmission checks.
 * Never used as a security boundary; the server still validates the grade. */
export function validateTeacherGradeInput(input: TeacherGradeInput): TeacherGradeValidation {
  const possible = input.pointsPossible == null ? NaN : Number(input.pointsPossible);
  if (!Number.isFinite(possible) || possible <= 0) {
    return { valid: false, message: "This assessment does not have a valid point value." };
  }

  if (input.rubric.length > 0) {
    const rubricScores: CriterionGrade[] = [];
    for (const criterion of input.rubric) {
      const raw = input.rubricInputs[criterion.id];
      if (!raw?.trim()) return { valid: false, message: "Score every rubric criterion before saving or posting." };
      const points = Number(raw);
      if (!Number.isFinite(points) || points < 0 || points > criterion.maxPoints) {
        return { valid: false, message: `${criterion.label} must be between 0 and ${criterion.maxPoints} points.` };
      }
      rubricScores.push({ id: criterion.id, points });
    }
    try {
      const total = scoreRubric([...input.rubric], rubricScores);
      if (total.possible !== possible) {
        return { valid: false, message: "Rubric points do not match this assessment's points possible." };
      }
      return { valid: true, earned: total.earned, grading: { rubricScores } };
    } catch {
      return { valid: false, message: "Check every rubric criterion before saving or posting." };
    }
  }

  if (!input.score.trim()) return { valid: false, message: "Enter a score before saving or posting." };
  const score = Number(input.score);
  if (!Number.isFinite(score) || score < 0 || score > possible) {
    return { valid: false, message: `Score must be between 0 and ${possible} points.` };
  }
  return { valid: true, earned: score, grading: { score } };
}

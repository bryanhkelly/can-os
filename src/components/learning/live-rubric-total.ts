import { scoreRubric } from "@/modules/learning/rubric";

/** Preview only. Canonical scoring and validation remain in scoreRubric. */
export function liveRubricTotal(
  rubric: Parameters<typeof scoreRubric>[0],
  inputs: Readonly<Record<string, string>>,
): number | null {
  if (!rubric.length || rubric.some((criterion) => !inputs[criterion.id]?.trim())) return null;
  try {
    return scoreRubric(rubric, rubric.map((criterion) => ({
      id: criterion.id,
      points: Number(inputs[criterion.id]),
    }))).earned;
  } catch {
    return null;
  }
}

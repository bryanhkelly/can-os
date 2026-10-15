export type RubricCriterion = { id: string; label: string; maxPoints: number; description?: string };
export type CriterionGrade = { id: string; points: number; comment?: string };
export function readRubric(value: unknown): RubricCriterion[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is RubricCriterion =>
    !!v && typeof v === "object" && typeof v.id === "string" &&
    typeof v.label === "string" && typeof v.maxPoints === "number" &&
    Number.isFinite(v.maxPoints) && v.maxPoints > 0 &&
    (v.description === undefined || typeof v.description === "string"));
}
export function scoreRubric(criteria: RubricCriterion[], grades: CriterionGrade[]) {
  if (!criteria.length || criteria.length > 20) throw new Error("A rubric must contain 1–20 criteria");
  if (new Set(criteria.map(c=>c.id)).size !== criteria.length) throw new Error("Duplicate criterion IDs");
  if (grades.length !== criteria.length || new Set(grades.map(g=>g.id)).size !== grades.length)
    throw new Error("Exactly one grade per criterion is required");
  let earned = 0, possible = 0;
  for (const c of criteria) {
    const g = grades.find(g=>g.id===c.id);
    if (!g || !Number.isFinite(g.points) || g.points < 0 || g.points > c.maxPoints)
      throw new Error(`Invalid points for ${c.label}`);
    earned += g.points;
    possible += c.maxPoints;
  }
  return { earned, possible, percentage: Math.round((earned / possible) * 10000) / 100 };
}
export const sampleRubric: RubricCriterion[] = [
  { id: "thesis", label: "Thesis", maxPoints: 30, description: "Clear, defensible argument" },
  { id: "evidence", label: "Evidence", maxPoints: 40, description: "Strong use of supporting sources" },
  { id: "clarity", label: "Clarity", maxPoints: 30, description: "Organization and presentation" },
];

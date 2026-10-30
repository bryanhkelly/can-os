import { z } from "zod";
import type { RubricCriterion } from "@/modules/learning/rubric";

const criterionSchema = z.object({
 id: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
 label: z.string().trim().min(2).max(120),
 maxPoints: z.number().finite().positive().max(1000),
 description: z.string().trim().max(1000).optional(),
}).strict();

/** Validate an optional teacher scoring rubric against an assessment's points possible. */
export function validateAssessmentRubric(input: unknown, pointsPossible: number): RubricCriterion[] {
 if (!Number.isFinite(pointsPossible) || pointsPossible < 1 || pointsPossible > 1000)
  throw new Error("Assessment points must be between 1 and 1000.");
 const criteria = z.array(criterionSchema).max(20).parse(input);
 if (!criteria.length) return criteria;
 if (new Set(criteria.map(item => item.id)).size !== criteria.length)
  throw new Error("Rubric criterion IDs must be unique.");
 const cents = (value: number) => {
  const rounded = Math.round(value * 100);
  if (Math.abs(value * 100 - rounded) > 0.00001)
   throw new Error("Points must use no more than two decimal places.");
  return rounded;
 };
 const total = criteria.reduce((sum, item) => sum + cents(item.maxPoints), 0);
 if (total !== cents(pointsPossible))
  throw new Error("Rubric criterion points must total the assessment points possible.");
 return criteria;
}

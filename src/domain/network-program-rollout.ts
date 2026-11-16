import { z } from "zod";
import { classDeliveryModeSchema, publisherOfferingKindSchema } from "./unified-class";
import { networkClassLaunchRecipeSchema } from "./network-class-launch";

/**
 * WS5 portable publisher rollout instructions, NOT a grant, adoption, or
 * publication command. Receiving operators use the current canonical Offering
 * adoption and Class authority before any mutation.
 *
 * v1 Class launch JSON is accepted for backward compatibility. v2 groups one
 * published Offering version's constituent Courses without copying content.
 */
const uuid = z.string().uuid();
export const programRolloutCourseSchema = z.object({
  courseVersionId: uuid,
  courseTitle: z.string().trim().min(1).max(200),
  isRequired: z.boolean(),
  sequenceNo: z.number().int().nonnegative().nullable(),
  suggestedClassTitle: z.string().trim().min(3).max(200),
  deliveryMode: classDeliveryModeSchema,
  capacity: z.number().int().positive().nullable(),
  recommendedSessionMinutes: z.number().int().min(15).max(480),
}).strict();

export const programRolloutRecipeSchema = z.object({
  version: z.literal(2),
  revision: z.number().int().min(1).max(10000),
  offeringVersionId: uuid,
  offeringTitle: z.string().trim().min(1).max(200),
  offeringKind: publisherOfferingKindSchema,
  courses: z.array(programRolloutCourseSchema).min(1).max(50),
}).strict().superRefine((plan, ctx) => {
  if (new Set(plan.courses.map(course => course.courseVersionId)).size !== plan.courses.length) {
    ctx.addIssue({ code: "custom", path: ["courses"], message: "Duplicate Course version in rollout" });
  }
  if (plan.offeringKind === "course" && plan.courses.length !== 1) {
    ctx.addIssue({ code: "custom", path: ["offeringKind"], message: "Course Offerings contain exactly one Course" });
  }
});
export type ProgramRolloutRecipe = z.infer<typeof programRolloutRecipeSchema>;

export const portableRolloutSchema = z.discriminatedUnion("version", [
  networkClassLaunchRecipeSchema, programRolloutRecipeSchema,
]);
export type PortableRolloutRecipe = z.infer<typeof portableRolloutSchema>;

export function parsePortableRollout(raw: string): PortableRolloutRecipe {
  if (raw.length > 24000) throw new Error("Rollout recipe is too large.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("Enter valid JSON rollout instructions."); }
  return portableRolloutSchema.parse(parsed);
}

export function serializeProgramRollout(recipe: ProgramRolloutRecipe): string {
  return JSON.stringify(programRolloutRecipeSchema.parse(recipe), null, 2);
}

/** Only explicit publisher product classification counts. Never guess Program
 * from the number of Courses or a network affiliation. */
export function publishedOfferingKind(definition: unknown): z.infer<typeof publisherOfferingKindSchema> {
  if (!definition || Array.isArray(definition) || typeof definition !== "object") return "other";
  const record = definition as Record<string, unknown>;
  const result = publisherOfferingKindSchema.safeParse(record.kind);
  return result.success ? result.data : "other";
}

export type LocalPublishedCourseOption = {
  offeringVersionId: string;
  courseVersionId: string;
  siteOptions: ReadonlyArray<{ id: string }>;
};

export type RolloutCourseStatus = "ready" | "adoption_required" | "site_authorization_required";

/** Advisory display only. Every server-side Class create/publish command MUST
 * recheck time-scoped operation, adoption, Course, publisher and Site grants.
 * Independent operators use exactly the same check as network members.
 */
export function assessLocalRollout(
  recipe: ProgramRolloutRecipe,
  options: ReadonlyArray<LocalPublishedCourseOption>,
  siteId: string | null,
): Array<{ courseVersionId: string; status: RolloutCourseStatus }> {
  return recipe.courses.map(course => {
    const matches = options.filter(option =>
      option.offeringVersionId === recipe.offeringVersionId &&
      option.courseVersionId === course.courseVersionId);
    return {
      courseVersionId: course.courseVersionId,
      status: matches.length === 0 ? "adoption_required" :
        siteId && !matches.some(option => option.siteOptions.some(site => site.id === siteId))
          ? "site_authorization_required" : "ready",
    };
  });
}

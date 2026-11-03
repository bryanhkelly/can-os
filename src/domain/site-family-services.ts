import { z } from "zod";
import type { PublicSchoolService } from "./parent-information";
import { unconfiguredClaim, verifiedPublicClaim } from "./parent-information";

/** Site-owned service statements, never a second transportation/meal system. */
export const familyServiceCategorySchema = z.enum([
  "meals", "transportation", "before_care", "after_care",
  "communication", "family_visits", "safety_summary",
]);
export const siteFamilyServiceSchema = z.object({
  category: familyServiceCategorySchema,
  status: z.enum(["not_offered", "planned", "confirmed", "available"]),
  description: z.string().trim().max(1200),
  evidenceReference: z.string().trim().max(500).nullable(),
  expiresOn: z.string().date().nullable(),
}).strict();
export const siteFamilyServicesSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().positive(),
  reviewedByPersonId: z.string().uuid(),
  reviewedAt: z.string().datetime(),
  entries: z.array(siteFamilyServiceSchema).max(7),
}).strict().superRefine((value, ctx) => {
  const categories = new Set<string>();
  for (const [index, entry] of value.entries.entries()) {
    if (categories.has(entry.category))
      ctx.addIssue({code:"custom",path:["entries",index,"category"],message:"Duplicate family service"});
    categories.add(entry.category);
    if (["confirmed","available"].includes(entry.status) &&
      (entry.description.length < 10 || !entry.evidenceReference ||
       entry.evidenceReference.length < 5))
      ctx.addIssue({code:"custom",path:["entries",index],message:
        "Confirmed services require reviewed description and source evidence"});
  }
});
export type SiteFamilyServices = z.infer<typeof siteFamilyServicesSchema>;

export function readSiteFamilyServices(metadata: Record<string, unknown> | null) {
  const result = siteFamilyServicesSchema.safeParse(metadata?.familyServices);
  return result.success ? result.data : null;
}

/** Public-safe projection: proposal is never availability. */
export function projectPublicFamilyServices(
  metadata: Record<string, unknown> | null,
  now = new Date(),
): PublicSchoolService[] {
  const snapshot = readSiteFamilyServices(metadata);
  const today = now.toISOString().slice(0,10);
  const categories = ["meals","transportation","before_care","after_care","safety_summary"] as const;
  return categories.map(category => {
    const item = snapshot?.entries.find(entry => entry.category === category);
    if (!item || (item.expiresOn && item.expiresOn < today))
      return {category,description:unconfiguredClaim<string>("institutional_record")};
    if (item.status === "not_offered") return {
      category, description:verifiedPublicClaim("Not offered", "institutional_record", snapshot!.revision),
    };
    if (item.status === "planned") return {
      category, description:item.description
        ? verifiedPublicClaim(item.description + " (Planned; not currently available)",
            "institutional_record",snapshot!.revision)
        : unconfiguredClaim<string>("institutional_record"),
    };
    const description=item.status === "confirmed"
      ? item.description + " (Confirmed; contact the school for availability)"
      : item.description;
    return {category,description:verifiedPublicClaim(description,"institutional_record",snapshot!.revision)};
  });
}

import { z } from "zod";

/** Multi-select intentions used for private Site planning and website concepts.
 * These values are not Program/Offering identities or enrollment authority. */
export const siteLaunchInterestIds = [
  "grades-6-8", "grades-9-12", "afterschool", "weekend",
  "summer", "evening", "adult", "senior",
] as const;

export const siteLaunchPreferencesSchema = z.object({
  delivery: z.enum(["physical", "digital", "both"]),
  interestIds: z.array(z.enum(siteLaunchInterestIds)).max(8)
    .refine(ids => new Set(ids).size === ids.length, "Duplicate interests are not allowed"),
}).strict();

export type SiteLaunchPreferences = z.infer<typeof siteLaunchPreferencesSchema>;

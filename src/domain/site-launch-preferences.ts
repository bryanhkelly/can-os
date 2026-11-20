import { z } from "zod";

/** Legacy eight-code vocabulary is retained for existing private Site records. */
export const siteLaunchInterestIds = [
  "grades-6-8", "grades-9-12", "afterschool", "weekend",
  "summer", "evening", "adult", "senior",
] as const;

/** Learning intent is distinct from days and time of day. These are not Programs. */
export const sitePlanningInterestIds = [
  "grades-6-8", "grades-9-12", "afterschool", "summer", "adult", "senior",
] as const;
export const sitePlanningTimingIds = ["weekdays", "weekends", "daytime", "evenings"] as const;
export const sitePlanningAudienceIds = ["children", "teens", "adults", "older_adults"] as const;

const distinct = <T extends string>(values: T[]) => new Set(values).size === values.length;

/**
 * The SAME Site-owned metadata.launchPreferences record used by Site Information
 * and the private website preview. The optional V2 fields let old stored records
 * and old readers coexist until a registrar explicitly saves a normalized plan.
 */
export const siteLaunchPreferencesSchema = z.object({
  delivery: z.enum(["physical", "digital", "both"]),
  interestIds: z.array(z.enum(siteLaunchInterestIds)).max(8)
    .refine(distinct, "Duplicate interests are not allowed"),
  planningVersion: z.literal(2).optional(),
  timingIds: z.array(z.enum(sitePlanningTimingIds)).max(4)
    .refine(distinct, "Duplicate timing preferences are not allowed").optional(),
  audienceIds: z.array(z.enum(sitePlanningAudienceIds)).max(4)
    .refine(distinct, "Duplicate audiences are not allowed").optional(),
  startingFocus: z.enum(sitePlanningInterestIds).nullable().optional(),
  // Canonical published Program reference codes (not adopted Solutions).
  // Older Site records omit this field and remain readable.
  programCodes: z.array(z.string().trim().min(3).max(128)).max(30)
    .refine(distinct, "Choose each Program once").optional(),
  startingProgramCode: z.string().trim().min(3).max(128).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.startingProgramCode && !value.programCodes?.includes(value.startingProgramCode))
    ctx.addIssue({ code: "custom", path: ["startingProgramCode"],
      message: "Starting Program must be selected." });
  if (value.startingFocus && !value.interestIds.includes(value.startingFocus))
    ctx.addIssue({ code: "custom", path: ["startingFocus"],
      message: "Starting focus must be a selected learning interest." });
});

export type SiteLaunchPreferences = z.infer<typeof siteLaunchPreferencesSchema>;

export const siteProgramsAudiencesV61Schema = z.object({
  interestIds: z.array(z.enum(sitePlanningInterestIds)).max(6)
    .refine(distinct, "Choose each learning interest once"),
  timingIds: z.array(z.enum(sitePlanningTimingIds)).max(4)
    .refine(distinct, "Choose each day or time once"),
  audienceIds: z.array(z.enum(sitePlanningAudienceIds)).max(4)
    .refine(distinct, "Choose each audience once"),
  startingFocus: z.enum(sitePlanningInterestIds).nullable(),
  programCodes: z.array(z.string().trim().min(3).max(128)).max(30)
    .refine(distinct, "Choose each Program once").optional(),
  startingProgramCode: z.string().trim().min(3).max(128).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.startingProgramCode && !value.programCodes?.includes(value.startingProgramCode))
    ctx.addIssue({ code: "custom", path: ["startingProgramCode"],
      message: "Choose a selected Program for your starting focus." });
  if (value.startingFocus && !value.interestIds.includes(value.startingFocus))
    ctx.addIssue({ code: "custom", path: ["startingFocus"],
      message: "Choose a selected learning interest for your starting focus." });
});
export type SiteProgramsAudiencesV61 = z.infer<typeof siteProgramsAudiencesV61Schema>;

export function emptySiteProgramsAudiencesV61(): SiteProgramsAudiencesV61 {
  return { interestIds: [], timingIds: [], audienceIds: [], startingFocus: null };
}

/**
 * Legacy weekend/evening codes are timing, never independent Programs.
 * Reading is pure; the first authorized V2 save performs the controlled
 * normalization. Unrecognized or corrupted stored preferences must fail closed.
 */
export function readSiteProgramsAudiencesV61(raw: unknown): SiteProgramsAudiencesV61 {
  if (raw == null) return emptySiteProgramsAudiencesV61();
  const source = siteLaunchPreferencesSchema.parse(raw);
  return siteProgramsAudiencesV61Schema.parse({
    interestIds: source.interestIds.filter(
      (id): id is (typeof sitePlanningInterestIds)[number] =>
        id !== "weekend" && id !== "evening"),
    timingIds: [...new Set([
      ...(source.timingIds ?? []),
      ...(source.interestIds.includes("weekend") ? ["weekends" as const] : []),
      ...(source.interestIds.includes("evening") ? ["evenings" as const] : []),
    ])],
    audienceIds: source.audienceIds ?? [],
    startingFocus: source.startingFocus ?? null,
    ...(source.programCodes ? { programCodes: source.programCodes } : {}),
    ...(source.startingProgramCode !== undefined
      ? { startingProgramCode: source.startingProgramCode } : {}),
  });
}

/** Merge only planning fields with the latest delivery under the Site row lock. */
export function applySiteProgramsAudiencesV61(
  previous: unknown, draft: SiteProgramsAudiencesV61,
  authoritativeDelivery?: SiteLaunchPreferences["delivery"],
): SiteLaunchPreferences {
  const old = previous == null ? null : siteLaunchPreferencesSchema.parse(previous);
  // Site Information is authoritative when it has been saved. Legacy intent
  // remains a fallback for Sites created before that module existed.
  const delivery = authoritativeDelivery ?? old?.delivery;
  if (!delivery) throw new Error("Save Learning Environment in Site Information before choosing Programs & Audiences.");
  const plan = siteProgramsAudiencesV61Schema.parse(draft);
  return siteLaunchPreferencesSchema.parse({
    delivery, planningVersion: 2,
    interestIds: plan.interestIds,
    timingIds: plan.timingIds,
    audienceIds: plan.audienceIds,
    startingFocus: plan.startingFocus,
    ...(plan.programCodes !== undefined ? { programCodes: plan.programCodes } : {}),
    ...(plan.startingProgramCode !== undefined
      ? { startingProgramCode: plan.startingProgramCode } : {}),
  });
}

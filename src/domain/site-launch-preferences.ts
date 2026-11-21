import { z } from "zod";
import { siteExperienceIds, siteExperienceById, siteExperienceOutcomeIds,
  siteExperienceLimit, siteExperienceActivityLimit, siteExperienceOutcomeLimit,
  validCustomExperienceName } from "./site-experience-interests";

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
const customExperiences = z.array(z.string().trim().refine(
  validCustomExperienceName, "Experience names must be plain text between 2 and 100 characters",
)).max(12).refine(values =>
  new Set(values.map(value => value.toLocaleLowerCase())).size === values.length,
  "Choose each custom Experience once");

/**
 * The SAME Site-owned metadata.launchPreferences record used by Site Information
 * and the private website preview. The optional V2 fields let old stored records
 * and old readers coexist until a registrar explicitly saves a normalized plan.
 */

/** Topic selections remain planning intent, never authorization to operate. */
export const siteExperienceDetailSchema=z.object({
  id:z.enum(siteExperienceIds),
  activityIds:z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))
    .max(siteExperienceActivityLimit).refine(distinct,"Choose each activity once"),
  outcomeIds:z.array(z.enum(siteExperienceOutcomeIds))
    .max(siteExperienceOutcomeLimit).refine(distinct,"Choose each outcome once"),
  audienceIds:z.array(z.enum(sitePlanningAudienceIds)).max(4)
    .refine(distinct,"Choose each audience once"),
  programIds:z.array(z.enum(sitePlanningInterestIds)).max(6)
    .refine(distinct,"Choose each Program once"),
  /** Published Program reference associations, separate from high-level interests. */
  programCodes:z.array(z.string().trim().min(3).max(128)).max(30)
    .refine(distinct,"Choose each Program reference once").optional(),
  priority:z.enum(["featured","planned","exploring"]),
}).strict().superRefine((value,ctx)=>{
  const topic=siteExperienceById.get(value.id);
  if(!topic || value.activityIds.some(id=>!topic.activities.some(option=>option.id===id)))
    ctx.addIssue({code:"custom",path:["activityIds"],
      message:"Choose activities listed for this Experience topic."});
});
export type SiteExperienceDetail=z.infer<typeof siteExperienceDetailSchema>;
const experienceDetailsSchema=z.array(siteExperienceDetailSchema).max(siteExperienceLimit)
  .refine(values=>distinct(values.map(value=>value.id)),"Choose each Experience once");
function validateExperienceMembership(value:{
  experienceIds?:readonly string[];experienceDetails?:readonly SiteExperienceDetail[];
},ctx:z.RefinementCtx){
  if(value.experienceDetails?.some(detail=>!value.experienceIds?.includes(detail.id)))
    ctx.addIssue({code:"custom",path:["experienceDetails"],
      message:"Experience details must match selected topics."});
}

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
  experienceIds: z.array(z.enum(siteExperienceIds)).max(siteExperienceIds.length)
    .refine(distinct, "Choose each Experience once").optional(),
  customExperiences: customExperiences.optional(),
  experienceDetails: experienceDetailsSchema.optional(),
}).strict().superRefine((value, ctx) => {
  validateExperienceMembership(value,ctx);
  if (value.startingProgramCode && !value.programCodes?.includes(value.startingProgramCode))
    ctx.addIssue({ code: "custom", path: ["startingProgramCode"],
      message: "Starting Program must be selected." });
  if (value.startingFocus && !value.interestIds.includes(value.startingFocus))
    ctx.addIssue({ code: "custom", path: ["startingFocus"],
      message: "Starting focus must be a selected learning interest." });
});

export type SiteLaunchPreferences = z.infer<typeof siteLaunchPreferencesSchema>;

/** Public Experience source, captured only on an authorized website-channel publish. */
export const sitePublishedExperienceSnapshotSchema=z.object({
  version:z.literal(2),
  interestIds:z.array(z.enum(siteLaunchInterestIds)).max(8),
  audienceIds:z.array(z.enum(sitePlanningAudienceIds)).max(4),
  experienceIds:z.array(z.enum(siteExperienceIds)).max(siteExperienceIds.length),
  customExperiences:customExperiences,
  experienceDetails:experienceDetailsSchema,
}).strict();
export type SitePublishedExperienceSnapshot=z.infer<typeof sitePublishedExperienceSnapshotSchema>;
export function snapshotSiteExperienceVision(preferences:SiteLaunchPreferences|null):SitePublishedExperienceSnapshot{
  return sitePublishedExperienceSnapshotSchema.parse({
    version:2,interestIds:preferences?.interestIds??[],
    audienceIds:preferences?.audienceIds??[],
    experienceIds:preferences?.experienceIds??[],
    customExperiences:preferences?.customExperiences??[],
    experienceDetails:preferences?.experienceDetails??[],
  });
}

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
  experienceIds: z.array(z.enum(siteExperienceIds)).max(siteExperienceIds.length)
    .refine(distinct, "Choose each Experience once").optional(),
  customExperiences: customExperiences.optional(),
  experienceDetails: experienceDetailsSchema.optional(),
}).strict().superRefine((value, ctx) => {
  validateExperienceMembership(value,ctx);
  if (value.startingProgramCode && !value.programCodes?.includes(value.startingProgramCode))
    ctx.addIssue({ code: "custom", path: ["startingProgramCode"],
      message: "Choose a selected Program for your starting focus." });
  if (value.startingFocus && !value.interestIds.includes(value.startingFocus))
    ctx.addIssue({ code: "custom", path: ["startingFocus"],
      message: "Choose a selected learning interest for your starting focus." });
});
export type SiteProgramsAudiencesV61 = z.infer<typeof siteProgramsAudiencesV61Schema>;

/** New writes enforce five total, while old Site plans remain readable until edited. */
export const siteProgramsAudiencesV61SaveSchema=siteProgramsAudiencesV61Schema.superRefine(
  (value,ctx)=>{
  for (const [index, detail] of (value.experienceDetails ?? []).entries()) {
    if (detail.audienceIds.some(id => !value.audienceIds.includes(id)))
      ctx.addIssue({ code: "custom", path: ["experienceDetails", index, "audienceIds"],
        message: "Experience audiences must be selected for this Site." });
    if (detail.programIds.some(id => !value.interestIds.includes(id)))
      ctx.addIssue({ code: "custom", path: ["experienceDetails", index, "programIds"],
        message: "Experience Program interests must be selected for this Site." });
    if (detail.programCodes?.some(code => !value.programCodes?.includes(code)))
      ctx.addIssue({ code: "custom", path: ["experienceDetails", index, "programCodes"],
        message: "Experience published Program references must be selected for this Site." });
  }
    if((value.experienceIds?.length??0)+(value.customExperiences?.length??0)>siteExperienceLimit)
      ctx.addIssue({code:"custom",path:["experienceIds"],
        message:"Choose up to five Experiences total, including custom Experiences."});
  });

/** Preserve legacy read compatibility, but remove references to withdrawn
 * Program/Audience selections from an explicit new planning draft. */
export function reconcileSiteExperienceAssociationsV61(
  draft: SiteProgramsAudiencesV61,
): SiteProgramsAudiencesV61 {
  const audiences = new Set(draft.audienceIds);
  const programs = new Set(draft.interestIds);
  const published = new Set(draft.programCodes ?? []);
  return { ...draft,
    experienceDetails: draft.experienceDetails?.map(detail => ({
      ...detail,
      audienceIds: detail.audienceIds.filter(id => audiences.has(id)),
      programIds: detail.programIds.filter(id => programs.has(id)),
      ...(detail.programCodes !== undefined
        ? { programCodes: detail.programCodes.filter(code => published.has(code)) } : {}),
    })),
  };
}

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
    ...(source.experienceIds !== undefined ? {experienceIds:source.experienceIds} : {}),
    ...(source.customExperiences !== undefined ? {customExperiences:source.customExperiences} : {}),
    ...(source.experienceDetails !== undefined ? {experienceDetails:source.experienceDetails} : {}),
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
  const plan = siteProgramsAudiencesV61SaveSchema.parse(draft);
  return siteLaunchPreferencesSchema.parse({
    delivery, planningVersion: 2,
    interestIds: plan.interestIds,
    timingIds: plan.timingIds,
    audienceIds: plan.audienceIds,
    startingFocus: plan.startingFocus,
    ...(plan.programCodes !== undefined ? { programCodes: plan.programCodes } : {}),
    ...(plan.startingProgramCode !== undefined
      ? { startingProgramCode: plan.startingProgramCode } : {}),
    ...(plan.experienceIds !== undefined ? {experienceIds:plan.experienceIds} : {}),
    ...(plan.customExperiences !== undefined ? {customExperiences:plan.customExperiences} : {}),
    ...(plan.experienceDetails !== undefined ? {experienceDetails:plan.experienceDetails} : {}),
  });
}

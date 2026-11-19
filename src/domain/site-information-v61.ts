import { z } from "zod";
import { siteLaunchPreferencesSchema } from "./site-launch-preferences";

/** Private Site Information planning records. No public or institutional approval follows from these. */
export const siteHostingV61Schema = z.object({
  hostingMode: z.enum(["same", "different", "undecided"]),
  separateHostName: z.string().trim().max(160),
  separateHostType: z.union([z.enum(["church", "community_nonprofit", "education_provider", "other"]), z.literal("")]),
}).strict().superRefine((host, ctx) => {
  if (host.hostingMode !== "different") return;
  if (host.separateHostName.length < 2) ctx.addIssue({
    code: "custom", path: ["separateHostName"], message: "Enter the separate host's name.",
  });
  if (!host.separateHostType) ctx.addIssue({
    code: "custom", path: ["separateHostType"], message: "Choose the host's type.",
  });
});
export type SiteHostingV61 = z.infer<typeof siteHostingV61Schema>;

export const siteEnvironmentV61Schema = z.object({
  delivery: z.enum(["physical", "digital", "both"]),
  physicalSpaceArrangement: z.union([z.enum(["owned_leased", "shared_hosted", "planned"]), z.literal("")]),
}).strict().superRefine((environment, ctx) => {
  if (environment.delivery !== "digital" && !environment.physicalSpaceArrangement) ctx.addIssue({
    code: "custom", path: ["physicalSpaceArrangement"], message: "Choose your planned physical space arrangement.",
  });
});
export type SiteEnvironmentV61 = z.infer<typeof siteEnvironmentV61Schema>;

const choices = <T extends readonly [string, ...string[]]>(values: T, max: number) =>
  z.array(z.enum(values)).max(max).refine(value => new Set(value).size === value.length, "Select each answer only once");

export const siteStoryV61Schema = z.object({
  motivations: choices(["access", "belonging", "personalized", "practical", "alternative", "creative", "character", "need"], 3),
  communityNeed: z.string().trim().max(1000),
  distinctives: choices(["flexible", "community", "personal", "hands-on", "faith", "service", "creative", "technology"], 8),
  foundingStory: z.string().trim().max(2000),
  values: choices(["belonging", "curiosity", "excellence", "integrity", "creativity", "service", "opportunity", "family"], 8),
  experiences: choices(["known", "confidence", "interests", "mastery", "skills", "purpose"], 6),
  futureVision: z.string().trim().max(2000),
}).strict();
export type SiteStoryV61 = z.infer<typeof siteStoryV61Schema>;

export const emptySiteStoryV61 = (): SiteStoryV61 => ({
  motivations: [], communityNeed: "", distinctives: [], foundingStory: "",
  values: [], experiences: [], futureVision: "",
});
export const emptySiteHostingV61 = (): SiteHostingV61 => ({
  hostingMode: "undecided", separateHostName: "", separateHostType: "",
});

export const siteStorySourceV61Schema = z.object({
  schemaVersion: z.literal(1),
  revision: z.string().datetime({ offset: true }),
  answers: siteStoryV61Schema,
  changedByPersonId: z.string().uuid(),
  updatedAt: z.string().datetime({ offset: true }),
  status: z.literal("private_source"),
}).strict();

export function cleanSiteHostingV61(value: SiteHostingV61): SiteHostingV61 {
  return value.hostingMode === "different" ? value
    : { hostingMode: value.hostingMode, separateHostName: "", separateHostType: "" };
}
export function cleanSiteEnvironmentV61(value: SiteEnvironmentV61): SiteEnvironmentV61 {
  return value.delivery === "digital" ? { delivery: "digital", physicalSpaceArrangement: "" } : value;
}

/** Update delivery without erasing existing Site Program interests. Invalid legacy
 * preferences fail closed instead of being replaced by an empty selection. */
export function applySiteEnvironmentDeliveryV61(previous: unknown, environment: SiteEnvironmentV61) {
  const parsed = siteLaunchPreferencesSchema.safeParse(previous);
  if (previous != null && !parsed.success)
    throw new Error("Existing Site interests need review. Refresh before editing the learning environment.");
  return siteLaunchPreferencesSchema.parse({
    delivery: environment.delivery,
    interestIds: parsed.success ? parsed.data.interestIds : [],
  });
}

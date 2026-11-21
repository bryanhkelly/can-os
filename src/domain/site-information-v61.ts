import { z } from "zod";
import { siteLaunchPreferencesSchema } from "./site-launch-preferences";

/** Private Site Information planning records. No public or institutional approval follows from these. */
export const siteTaxStatusV61Values = [
  "not_provided", "recognized_501c3", "qualifying_church", "group_exemption",
  "fiscal_sponsor", "pending", "not_tax_exempt", "unsure",
] as const;
export type SiteTaxStatusV61 = (typeof siteTaxStatusV61Values)[number];

export const siteHostingV61Schema = z.object({
  hostingMode: z.enum(["same", "different", "undecided"]),
  separateHostName: z.string().trim().max(160),
  separateHostType: z.union([z.enum(["church", "community_nonprofit", "education_provider", "other"]), z.literal("")]),
  /** Self-reported status of the responsible organization, host or fiscal sponsor.
   * This alone never grants a public verified 501(c)(3) claim. Optional for legacy Sites. */
  nonprofitStatus: z.enum(siteTaxStatusV61Values).optional(),
  nonprofitSubject: z.enum(["responsible", "host", "sponsor"]).optional(),
  nonprofitOrganizationName: z.string().trim().max(160).optional(),
  nonprofitEin: z.union([z.literal(""), z.string().regex(/^\d{2}-?\d{7}$/, "Enter a nine-digit EIN")]).optional(),
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
  nonprofitStatus: "not_provided", nonprofitSubject: "responsible",
  nonprofitOrganizationName: "", nonprofitEin: "",
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
  // Host-specific answers become inapplicable when the host is the responsible
  // organization. The tax/status answers belong to the selected subject and
  // must not be silently erased when switching hosting modes.
  return value.hostingMode === "different" ? value
    : { ...value, separateHostName: "", separateHostType: "" };
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
    ...(parsed.success ? parsed.data : {}),
    delivery: environment.delivery,
    interestIds: parsed.success ? parsed.data.interestIds : [],
  });
}

/** Audit only field-presence metadata. Never copy private Story answers into audit JSON. */
export function siteStoryAuditSummaryV61(value: SiteStoryV61) {
  return {
    fieldsAnswered: {
      motivations: value.motivations.length > 0,
      communityNeed: Boolean(value.communityNeed.trim()),
      distinctives: value.distinctives.length > 0,
      foundingStory: Boolean(value.foundingStory.trim()),
      values: value.values.length > 0,
      experiences: value.experiences.length > 0,
      futureVision: Boolean(value.futureVision.trim()),
    },
  };
}

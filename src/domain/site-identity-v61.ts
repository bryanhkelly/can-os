import { z } from "zod";

/** Self-described Site identity, independent of the responsible or hosting
 * organization, legal status, network membership and operating authority. */
export const siteIdentityTypeOptionsV61 = [
  { value: "church_community", label: "Church or faith community" },
  { value: "faith_based_org", label: "Faith-based organization or ministry" },
  { value: "community_nonprofit", label: "Community or nonprofit organization" },
  { value: "school_education", label: "School or education provider" },
  { value: "training_workforce", label: "Training or workforce organization" },
  { value: "independent_initiative", label: "Independent community initiative" },
  { value: "other", label: "Other" },
] as const;

export const siteFaithTraditionOptionsV61 = [
  { value: "christian", label: "Christian" },
  { value: "muslim", label: "Muslim" },
  { value: "jewish", label: "Jewish" },
  { value: "hindu", label: "Hindu" },
  { value: "buddhist", label: "Buddhist" },
  { value: "sikh", label: "Sikh" },
  { value: "interfaith", label: "Interfaith or multifaith" },
  { value: "other", label: "Other tradition" },
] as const;

export const siteIdentityV61Schema = z.object({
  siteType: z.enum(siteIdentityTypeOptionsV61.map(item => item.value) as [
    (typeof siteIdentityTypeOptionsV61)[number]["value"],
    ...(typeof siteIdentityTypeOptionsV61)[number]["value"][],
  ]),
  faithOrientation: z.enum(["faith_based", "not_faith_based", "undecided"]),
  faithTradition: z.union([
    z.enum(siteFaithTraditionOptionsV61.map(item => item.value) as [
      (typeof siteFaithTraditionOptionsV61)[number]["value"],
      ...(typeof siteFaithTraditionOptionsV61)[number]["value"][],
    ]),
    z.literal(""),
  ]),
}).strict().superRefine((value, context) => {
  if ((value.siteType === "church_community" || value.siteType === "faith_based_org") &&
      value.faithOrientation !== "faith_based") {
    context.addIssue({code: "custom", path: ["faithOrientation"],
      message: "Choose a faith-based identity for this type of Site."});
  }
});
export type SiteIdentityV61 = z.infer<typeof siteIdentityV61Schema>;
export type SiteIdentityV61Draft = Omit<SiteIdentityV61, "siteType"> & {
  siteType: SiteIdentityV61["siteType"] | "";
};
export const emptySiteIdentityV61 = (): SiteIdentityV61Draft => ({
  siteType: "", faithOrientation: "undecided", faithTradition: "",
});
export function isFaithBasedSiteIdentityV61(
  identity: SiteIdentityV61 | SiteIdentityV61Draft | null | undefined,
): boolean {
  return identity?.faithOrientation === "faith_based";
}
export function isChurchSiteIdentityV61(
  identity: SiteIdentityV61 | SiteIdentityV61Draft | null | undefined,
): boolean {
  return identity?.siteType === "church_community";
}

/** Purpose-specific editorial cues, not proof of affiliation or permission
 * to make public theological, legal, academic or institutional claims. */
export function siteIdentityEditorialContextV61(
  identity: SiteIdentityV61 | SiteIdentityV61Draft | null | undefined,
) {
  switch (identity?.siteType) {
    case "church_community":
      return { label: "Church or faith community", kind: "faith community",
        storyPrompt: "Share the history, mission and hopes of your faith community." };
    case "faith_based_org":
      return { label: "Faith-based organization or ministry", kind: "faith-based organization",
        storyPrompt: "Share the mission, service and story behind your organization." };
    case "community_nonprofit":
      return { label: "Community or nonprofit organization", kind: "community organization",
        storyPrompt: "Share the needs, relationships and mission shaping your community work." };
    case "school_education":
      return { label: "School or education provider", kind: "learning community",
        storyPrompt: "Share your educational vision, approach and the community you hope to serve." };
    case "training_workforce":
      return { label: "Training or workforce organization", kind: "learning initiative",
        storyPrompt: "Share the skills, opportunities and partnerships behind your training vision." };
    case "independent_initiative":
      return { label: "Independent community initiative", kind: "community initiative",
        storyPrompt: "Share why you are bringing people together and what you hope to build." };
    case "other":
      return { label: "Other Site", kind: "community initiative",
        storyPrompt: "Share what makes your organization or community special." };
    default:
      return { label: "Your Site", kind: "learning community",
        storyPrompt: "Share what matters to your community and what you hope to build." };
  }
}

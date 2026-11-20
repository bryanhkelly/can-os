import { z } from "zod";
import { containsProtectedInstitutionalClaim } from "./site-local-content";

/** Brand-independent source content. No Site theme, media blob or publication claim is stored here. */
export const marketingPurposeIds = ["site-announcement", "program-interest", "interest-invitation", "event-invitation"] as const;
export const marketingAudienceIds = [
  "families", "students", "adult-learners", "older-adults",
  "congregation", "community", "partners", "volunteers",
] as const;
export const marketingFormatIds = ["email", "flyer", "social", "handout", "qr-card"] as const;
export const marketingPackageStatusIds = ["draft", "archived"] as const;

export const marketingPackageContentSchema = z.object({
  purpose: z.enum(marketingPurposeIds),
  audiences: z.array(z.enum(marketingAudienceIds)).max(8),
  geography: z.string().trim().max(120),
  headline: z.string().trim().max(160),
  message: z.string().trim().max(1600),
  callToAction: z.string().trim().max(100),
  formats: z.array(z.enum(marketingFormatIds)).max(5),
}).strict();
export type MarketingPackageContent = z.infer<typeof marketingPackageContentSchema>;
export type MarketingPurpose = MarketingPackageContent["purpose"];
/** Shared release/preflight protection. The Package name also becomes
 * immutable release metadata, so preview must inspect it just like release.
 * Site Story and Program intent are suggestions, not approved public claims.
 */
export function marketingPackageClaimsRequireReview(
  title:string,content:MarketingPackageContent,
):boolean{
  return containsProtectedInstitutionalClaim(
    [title,content.headline,content.message,content.callToAction].join(" "),
  );
}

export type MarketingFormat = MarketingPackageContent["formats"][number];

export const marketingPurposeOptions: ReadonlyArray<{id: MarketingPurpose; label: string; description: string}> = [
  { id: "site-announcement", label: "Introduce our Site", description: "Tell your community about the learning experience you are planning." },
  { id: "program-interest", label: "Share a program idea", description: "Describe a program you hope to offer, without implying registration is open." },
  { id: "interest-invitation", label: "Invite people to learn more", description: "Encourage people to express interest and stay informed." },
  { id: "event-invitation", label: "Invite people to an event", description: "Prepare wording for a future information session or open house." },
];

export const marketingAudienceOptions: ReadonlyArray<{id: MarketingPackageContent["audiences"][number]; label: string}> = [
  { id: "families", label: "Parents and families" },
  { id: "students", label: "Students and young people" },
  { id: "adult-learners", label: "Adult learners" },
  { id: "older-adults", label: "Older adults" },
  { id: "congregation", label: "Our congregation" },
  { id: "community", label: "Neighbors and community members" },
  { id: "partners", label: "Community partners" },
  { id: "volunteers", label: "Potential volunteers" },
];

export const marketingFormatOptions: ReadonlyArray<{id: MarketingFormat; label: string; description: string}> = [
  { id: "email", label: "Email", description: "Send a personal, branded announcement." },
  { id: "flyer", label: "Flyer", description: "Print or share a one-page announcement." },
  { id: "social", label: "Social image", description: "Share a prepared image and caption." },
  { id: "handout", label: "Handout", description: "Give someone a short introduction." },
  { id: "qr-card", label: "QR card", description: "Link to an authorized destination when available." },
];

/** Suggestions are deliberately aspirational, not assertions of operating approval. */
export function initialMarketingContent(siteName: string, purpose: MarketingPurpose): MarketingPackageContent {
  const name = siteName.trim().slice(0, 100) || "Our learning community";
  const suggestions: Record<MarketingPurpose, { headline: string; message: string; callToAction: string }> = {
    "site-announcement": {
      headline: "A new learning community is taking shape.",
      message: "We are exploring a new learning community at " + name + ". We would love to share the vision and hear what matters to our neighbors.",
      callToAction: "Learn about our vision",
    },
    "program-interest": {
      headline: "Explore what we could learn together.",
      message: name + " is exploring new learning opportunities for our community. We invite you to share which experiences would be useful to you.",
      callToAction: "Tell us what interests you",
    },
    "interest-invitation": {
      headline: "Help shape what comes next.",
      message: "We would love to hear from people interested in future learning opportunities with " + name + ". Share your interests and stay connected.",
      callToAction: "Express interest",
    },
    "event-invitation": {
      headline: "Let's talk about learning in our community.",
      message: name + " is planning an opportunity to gather, share ideas and answer questions. Event details will be provided once confirmed.",
      callToAction: "Learn about the event",
    },
  };
  return {
    purpose,
    audiences: [],
    geography: "",
    ...suggestions[purpose],
    formats: ["email", "flyer"],
  };
}

export type MarketingPackageStep = "menu" | "audience" | "messages" | "assets";

/** Editing is allowed at any step; completion guidance never authorizes sending or publication. */
export function marketingStepIssue(step: MarketingPackageStep, title: string, content: MarketingPackageContent): string | null {
  if (step === "menu" && !title.trim()) return "Name this package before continuing.";
  if (step === "audience" && !content.audiences.length) return "Select at least one audience.";
  if (step === "messages" && (!content.headline.trim() || !content.message.trim()))
    return "Add both a headline and a message.";
  if (step === "assets" && !content.formats.length) return "Select at least one format.";
  return null;
}

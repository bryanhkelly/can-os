import { z } from "zod";
import type { PublicAcademicProgram } from "./academic-program-publication";
import type { SiteNoncreditListing } from "./site-noncredit-public";
import { noncreditEnrollmentOrigin } from "./site-noncredit-public";
import { containsProtectedInstitutionalClaim } from "./site-local-content";
import { siteLaunchInterestIds, type SiteLaunchPreferences } from "./site-launch-preferences";

/** A Site owns placement and presentation. A channel only references a
 * separately authorized data source; the editor cannot write Program facts,
 * create an Offering or manufacture an enrollment link. */
export const siteContentChannelIds = [
  "learning.interests", "learning.academics",
  "learning.enrichment", "learning.noncredit",
] as const;
export type SiteContentChannelId = typeof siteContentChannelIds[number];

const editorial = (max: number) => z.string().trim().max(max)
  .refine(value => !/[<>\u0000-\u001f]/.test(value) &&
    !containsProtectedInstitutionalClaim(value),
  "Website block copy must be plain text without institutional or admissions claims");

export const siteContentBlockSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
  channel: z.enum(siteContentChannelIds),
  placement: z.enum(["learning", "community", "closing"]),
  layout: z.enum(["cards", "list", "featured"]),
  enabled: z.boolean(),
  eyebrow: editorial(64),
  title: editorial(120),
  description: editorial(320),
}).strict();

export const siteContentChannelConfigSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().min(0).max(2147483647),
  blocks: z.array(siteContentBlockSchema).max(8)
    .superRefine((blocks, ctx) => {
      const seenIds = new Set<string>();
      const seenChannels = new Set<string>();
      blocks.forEach((block, index) => {
        if (seenIds.has(block.id) || seenChannels.has(block.channel))
          ctx.addIssue({code: "custom", path: [index],
            message: "A website block ID and data channel may only be used once"});
        seenIds.add(block.id);
        seenChannels.add(block.channel);
      });
    }),
}).strict();

export type SiteContentBlock = z.infer<typeof siteContentBlockSchema>;
export type SiteContentChannelConfig = z.infer<typeof siteContentChannelConfigSchema>;

export const defaultSiteContentChannelConfig: SiteContentChannelConfig = {
  version: 1,
  revision: 0,
  blocks: [{
    id: "planning-interests", channel: "learning.interests",
    placement: "learning", layout: "cards", enabled: true,
    eyebrow: "Your learning community",
    title: "Programs you are exploring",
    description: "These are planning interests, not approved offerings or enrollment opportunities.",
  }],
};

/** Unconfigured historical Sites inherit only a PRIVATE proposed-program block.
 * A published website never renders private interests from this default. */
export function readSiteContentChannelConfig(raw: unknown): SiteContentChannelConfig {
  if (raw === undefined || raw === null) return defaultSiteContentChannelConfig;
  return siteContentChannelConfigSchema.parse(raw);
}

export const siteContentChannelDescriptions: Record<SiteContentChannelId, {
  label: string; description: string; privateOnly: boolean;
  defaultTitle: string; defaultEyebrow: string; defaultDescription: string;
}> = {
  "learning.interests": {
    label: "Proposed learning programs", privateOnly: true,
    description: "Private plans selected in Launch Studio. Never publish these as offerings.",
    defaultTitle: "Programs you are exploring", defaultEyebrow: "Your learning community",
    defaultDescription: "These are planning interests, not approved offerings or enrollment opportunities.",
  },
  "learning.academics": {
    label: "Reviewed academic programs", privateOnly: false,
    description: "Pulls reviewed academic marketing records, not unapproved school drafts.",
    defaultTitle: "Explore our academic programs", defaultEyebrow: "Learning pathways",
    defaultDescription: "Learn about the academic programs currently described by this Site.",
  },
  "learning.enrichment": {
    label: "Published enrichment programs", privateOnly: false,
    description: "Pulls published Site enrichment catalog records.",
    defaultTitle: "Learning beyond the classroom", defaultEyebrow: "Explore more",
    defaultDescription: "Discover published enrichment and community activities.",
  },
  "learning.noncredit": {
    label: "Eligible noncredit training", privateOnly: false,
    description: "Pulls separately approved, currently enrollable Site training releases.",
    defaultTitle: "Training and learning", defaultEyebrow: "Available courses",
    defaultDescription: "Explore currently eligible training registrations.",
  },
};

const interestCopy: Record<typeof siteLaunchInterestIds[number], {title: string; description: string}> = {
  "grades-6-8": {title: "Grades 6–8", description: "Exploring middle school curriculum"},
  "grades-9-12": {title: "Grades 9–12", description: "Exploring high school curriculum"},
  afterschool: {title: "Afterschool", description: "Exploring programs after the school day"},
  weekend: {title: "Weekend Learning", description: "Exploring weekend learning programs"},
  summer: {title: "Summer & Breaks", description: "Exploring seasonal learning experiences"},
  evening: {title: "Evening Learning", description: "Exploring evening learning programs"},
  adult: {title: "Adult Learning", description: "Exploring adult education and training"},
  senior: {title: "Senior Programs", description: "Exploring learning for older adults"},
};

export type SiteContentItem = {
  id: string; title: string; description: string; label: string;
  link?: {href: string; label: string};
};
export type SiteContentBlockProjection = SiteContentBlock & {items: SiteContentItem[]};

export type SiteContentChannelFeeds = {
  /** The Site, not the preview route, resolves its channel sources. */
  mode: "private" | "public";
  preferences?: SiteLaunchPreferences | null;
  academicPrograms?: readonly PublicAcademicProgram[];
  enrichment?: readonly {
    seasonId: string; title: string; programName: string;
    registrationOpen: boolean;
  }[];
  noncredit?: readonly SiteNoncreditListing[];
  enrollmentOrigin?: string | null;
};

/** Pure, bounded projection shared by live Sites and authenticated previews.
 * Server catalog readers retain authority over everything in the feeds. */
export function resolveSiteContentBlocks(
  config: SiteContentChannelConfig,
  feeds: SiteContentChannelFeeds,
): SiteContentBlockProjection[] {
  const origin = noncreditEnrollmentOrigin(feeds.enrollmentOrigin);
  return config.blocks.flatMap(block => {
    if (!block.enabled) return [];
    if (block.channel === "learning.interests" && feeds.mode !== "private") return [];
    let items: SiteContentItem[] = [];
    switch (block.channel) {
      case "learning.interests":
        items = (feeds.preferences?.interestIds ?? []).map(id => ({
          id, title: interestCopy[id].title, description: interestCopy[id].description,
          label: "Proposed · not enrolling",
        }));
        break;
      case "learning.academics":
        items = (feeds.academicPrograms ?? []).map(program => ({
          id: program.programId, title: program.title, description: program.summary,
          label: program.availability === "operating"
            ? "Reviewed academic program" : "Program planned · admissions not open",
          link: {href: "/academics", label: "Explore academic programs"},
        }));
        break;
      case "learning.enrichment":
        items = (feeds.enrichment ?? []).map(item => ({
          id: item.seasonId, title: item.title,
          description: item.programName,
          label: item.registrationOpen ? "Published program" : "Registration not open",
          link: {href: "/student-life", label: "View program details"},
        }));
        break;
      case "learning.noncredit":
        items = (feeds.noncredit ?? []).map(item => ({
          id: item.releaseId, title: item.title, description: item.siteName,
          label: item.seatsRemaining > 0 ? "Enrollment available" :
            item.waitlistAvailable ? "Waitlist available" : "Registration unavailable",
          ...(origin && (item.seatsRemaining > 0 || item.waitlistAvailable) &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.releaseId)
            ? {link: {href: origin + "/learn/enroll?release=" + encodeURIComponent(item.releaseId),
              label: item.seatsRemaining > 0 ? "Register for training" : "Join the waitlist"}}
            : {}),
        }));
        break;
    }
    return items.length ? [{...block, items}] : [];
  });
}

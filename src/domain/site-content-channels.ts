import { z } from "zod";
import type { PublicAcademicProgram } from "./academic-program-publication";
import type { SiteNoncreditListing } from "./site-noncredit-public";
import { noncreditEnrollmentOrigin } from "./site-noncredit-public";
import { containsProtectedInstitutionalClaim } from "./site-local-content";
import { siteLaunchInterestIds, type SiteLaunchPreferences } from "./site-launch-preferences";
import { projectSiteEnrollmentOpportunities } from "./site-enrollment-opportunities";

/** A Site owns placement and presentation. A channel only references a
 * separately authorized data source; the editor cannot write Program facts,
 * create an Offering or manufacture an enrollment link. */
export const siteContentChannelIds = [
  "learning.interests", "learning.academics",
  "learning.enrichment", "learning.noncredit",
  "site.setup", "site.network", "learning.classes", "learning.opportunities",
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
  /** Optional means legacy V1/V2 blocks remain valid and default to home. */
  page: z.enum(["/", "/programs", "/courses", "/classes", "/academics", "/student-life"]).optional(),
  targetKinds: z.array(z.enum(["school", "program", "course", "class"])).max(4).optional(),
  sort: z.enum(["source", "title", "upcoming"]).optional(),
  limit: z.number().int().min(1).max(40).optional(),
  enabled: z.boolean(),
  eyebrow: editorial(64),
  title: editorial(120),
  description: editorial(320),
}).strict();

export const siteContentChannelConfigSchema = z.object({
  version: z.literal(2),
  revision: z.number().int().min(0).max(2147483647),
  blocks: z.array(siteContentBlockSchema).max(12)
    .superRefine((blocks, ctx) => {
      const seenIds = new Set<string>();
      blocks.forEach((block, index) => {
        if (seenIds.has(block.id))
          ctx.addIssue({code: "custom", path: [index],
            message: "Each website block needs a unique ID"});
        seenIds.add(block.id);
      });
    }),
}).strict();

export type SiteContentBlock = z.infer<typeof siteContentBlockSchema>;
export type SiteContentChannelConfig = z.infer<typeof siteContentChannelConfigSchema>;

export const defaultSiteContentChannelConfig: SiteContentChannelConfig = {
  version: 2,
  revision: 0,
  blocks: [{
    id: "site-setup", channel: "site.setup",
    placement: "community", layout: "list", enabled: true,
    eyebrow: "Your Site",
    title: "How your learning Site is taking shape",
    description: "Private setup facts. These do not certify facilities, program delivery or operating approval.",
  }, {
    id: "site-network", channel: "site.network",
    placement: "closing", layout: "list", enabled: true,
    eyebrow: "Your network",
    title: "Community and network",
    description: "Affiliations are reviewed separately. A pending request does not confer network authority.",
  }, {
    id: "planning-interests", channel: "learning.interests",
    placement: "learning", layout: "cards", enabled: true,
    eyebrow: "Your learning community",
    title: "Programs you are exploring",
    description: "These are planning interests, not approved offerings or enrollment opportunities.",
  }, {
    id: "public-classes", channel: "learning.classes",
    placement: "learning", layout: "cards", enabled: true,
    eyebrow: "Classroom experiences", title: "Upcoming learning Classes",
    description: "Publicly published Classes at this Site. Enrollment is managed separately.",
  }, {
    id: "enrollment-opportunities", channel: "learning.opportunities",
    placement: "learning", layout: "cards", enabled: false,
    eyebrow: "Enrollment & discovery", title: "Find your next learning opportunity",
    description: "Approved schools, Programs, Courses and Classes with their authorized next step.",
  }, {
    id: "eligible-training", channel: "learning.noncredit",
    placement: "learning", layout: "cards", enabled: true,
    eyebrow: "Training & learning",
    title: "Programs available for enrollment",
    description: "Approved noncredit training opportunities for this Site.",
  }],
};

/** V1 Site settings lacked a home for identity, location, delivery and network.
 * An explicit V2 save can remove/rearrange these private blocks normally.
 * An existing V1 document is upcast without destroying its own block choices. */
const legacySiteContentChannelConfigSchema = siteContentChannelConfigSchema.extend({
  version: z.literal(1),
});
export function readSiteContentChannelConfig(raw: unknown): SiteContentChannelConfig {
  if (raw === undefined || raw === null) return defaultSiteContentChannelConfig;
  const v2 = siteContentChannelConfigSchema.safeParse(raw);
  if (v2.success) return v2.data;
  const v1 = legacySiteContentChannelConfigSchema.parse(raw);
  const missing = defaultSiteContentChannelConfig.blocks.filter(block =>
    (block.channel === "site.setup" || block.channel === "site.network" || block.channel === "learning.classes") &&
    !v1.blocks.some(existing => existing.channel === block.channel));
  return siteContentChannelConfigSchema.parse({
    ...v1, version: 2, blocks: [...v1.blocks, ...missing],
  });
}
export function safeReadSiteContentChannelConfig(raw: unknown): SiteContentChannelConfig {
  try { return readSiteContentChannelConfig(raw); }
  catch { return defaultSiteContentChannelConfig; }
}

export const siteContentChannelDescriptions: Record<SiteContentChannelId, {
  label: string; description: string; privateOnly: boolean;
  defaultTitle: string; defaultEyebrow: string; defaultDescription: string;
}> = {
  "site.setup": {
    label: "Site setup facts", privateOnly: true,
    description: "Private Site identity, planning location, time zone and selected delivery mode.",
    defaultTitle: "How your learning Site is taking shape", defaultEyebrow: "Your Site",
    defaultDescription: "These details are planned, not verified public operating claims.",
  },
  "site.network": {
    label: "Network affiliation status", privateOnly: true,
    description: "Private affiliation status from network review. Never a public brand endorsement.",
    defaultTitle: "Community and network", defaultEyebrow: "Your network",
    defaultDescription: "Network requests do not automatically grant membership or brand rights.",
  },
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
  "learning.classes": {
    label: "Published native Classes", privateOnly: false,
    description: "Only published public Class Offerings at the exact approved canonical Site, with safe next-Session details.",
    defaultTitle: "Upcoming learning Classes", defaultEyebrow: "Classroom experiences",
    defaultDescription: "Publicly published Classes at this Site. Registration terms are governed separately.",
  },
  "learning.opportunities": {
    label: "Enrollment opportunities", privateOnly: false,
    description: "Unified approved School, Program, Course and Class discovery. Enrollment permissions come from each owning service.",
    defaultTitle: "Find your next learning opportunity", defaultEyebrow: "Enrollment & discovery",
    defaultDescription: "Explore authorized Schools, Programs, Courses and Classes.",
  },
  "learning.noncredit": {
    label: "Eligible noncredit training", privateOnly: false,
    description: "Pulls separately approved, currently enrollable Site training releases.",
    defaultTitle: "Training and learning", defaultEyebrow: "Available courses",
    defaultDescription: "Explore currently eligible training registrations.",
  },
};

const interestCopy: Record<(typeof siteLaunchInterestIds)[number], {title: string; description: string}> = {
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
  startsAt?: string | null;
  link?: {href: string; label: string};
};
export type SiteContentBlockProjection = SiteContentBlock & {items: SiteContentItem[]};

export type SitePublishedClassListing = {
  classId:string;title:string;
  deliveryMode:"self_paced"|"scheduled"|"facilitated"|"hybrid";
  nextStartsAt:string|null;
};

export type SiteContentChannelFeeds = {
  /** The Site, not the preview route, resolves its channel sources. */
  mode: "private" | "public";
  preferences?: SiteLaunchPreferences | null;
  siteSetup?: {
    name: string; organizationName: string; city?: string | null;
    state?: string | null; timezone?: string | null;
  } | null;
  /** Only Site-authorized preview readers supply independently reviewed statuses. */
  networkAffiliations?: readonly {name:string;status:"pending"|"approved"|"rejected"|"revoked"}[] | null;
  networkStatusKnown?: boolean;
  academicPrograms?: readonly PublicAcademicProgram[];
  enrichment?: readonly {
    seasonId: string; title: string; programName: string;
    registrationOpen: boolean;
  }[];
  noncredit?: readonly SiteNoncreditListing[];
  classes?: readonly SitePublishedClassListing[];
  classTimezone?: string | null;
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
    if ((block.channel === "learning.interests" || block.channel === "site.setup" ||
      block.channel === "site.network") && feeds.mode !== "private") return [];
    let items: SiteContentItem[] = [];
    switch (block.channel) {
      case "site.setup": {
        const setup=feeds.siteSetup;
        if (setup) {
          items = [
            {id:"site-name",title:"Site name",description:setup.name,label:"Saved Site"},
            {id:"responsible-organization",title:"Responsible organization",
              description:setup.organizationName,label:"Saved Site"},
            ...(setup.city && setup.state ? [{id:"planning-location",title:"Planned location",
              description:setup.city+", "+setup.state,label:"Planning information · not verified"}] : []),
            ...(setup.timezone ? [{id:"site-timezone",title:"Site time zone",
              description:setup.timezone,label:"Scheduling reference · not a public timetable"}] : []),
            ...(feeds.preferences ? [{id:"delivery-intent",title:"Intended delivery",
              description:feeds.preferences.delivery==="both" ? "Physical and digital" :
                feeds.preferences.delivery==="physical" ? "Physical / in person" : "Digital / online",
              label:"Planning intent · not an approved delivery mode"}] : []),
          ];
        }
        break;
      }
      case "site.network":
        if (feeds.networkStatusKnown) {
          items = feeds.networkAffiliations?.length ? feeds.networkAffiliations.map((network,index)=>({
            id:"network-"+index,title:network.name,
            description:network.status==="approved"
              ? "Affiliation approved. Public branding and program use require separate authority."
              : network.status==="pending" ? "Requested. Network HQ review is pending."
              : network.status==="revoked" ? "Affiliation revoked." : "Affiliation not approved.",
            label:"Affiliation: "+network.status,
          })) : [{
            id:"independent",title:"Independent Site",
            description:"No network affiliation is currently requested or approved.",
            label:"Independent operation",
          }];
        }
        break;
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
          ...(feeds.mode === "public" ? {link: {href: "/academics", label: "Explore academic programs"}} : {}),
        }));
        break;
      case "learning.enrichment":
        items = (feeds.enrichment ?? []).map(item => ({
          id: item.seasonId, title: item.title,
          description: item.programName,
          label: item.registrationOpen ? "Published program" : "Registration not open",
          ...(feeds.mode === "public" ? {link: {href: "/student-life", label: "View program details"}} : {}),
        }));
        break;
      case "learning.classes": {
        const labels = {
          self_paced:"Self-paced",scheduled:"Scheduled",facilitated:"Facilitated",
          hybrid:"Hybrid",
        } as const;
        items=(feeds.classes ?? []).map(item=>{
          let next="";
          if(item.nextStartsAt){
            try{
              next=" · Next session "+new Intl.DateTimeFormat("en-US",{
                year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",
                timeZone:feeds.classTimezone??"UTC",timeZoneName:"short",
              }).format(new Date(item.nextStartsAt));
            }catch{next="";}
          }
          return {
            id:item.classId,title:item.title,
            description:labels[item.deliveryMode]+next,
            label:"Published public Class · Enrollment terms separately governed",
          };
        });
        break;
      }
      case "learning.opportunities":
        items = projectSiteEnrollmentOpportunities(feeds)
          .filter(item=>!block.targetKinds?.length || block.targetKinds.includes(item.kind))
          .map(item=>({
            id:item.id,title:item.title,description:item.description,
            startsAt:item.startsAt,
            label:item.kind.charAt(0).toUpperCase()+item.kind.slice(1)+" · "+
              (item.status==="apply"?"Applications open":
                item.status==="register"?"Enrollment available":
                item.status==="waitlist"?"Waitlist available":
                item.status==="closed"?"Registration unavailable":"Explore"),
            ...(feeds.mode==="public" && item.action ? {link:item.action}:{}),
          }));
        break;
      case "learning.noncredit":
        items = (feeds.noncredit ?? []).map(item => ({
          id: item.releaseId, title: item.title, description: item.siteName,
          label: item.seatsRemaining > 0 ? "Enrollment available" :
            item.waitlistAvailable ? "Waitlist available" : "Registration unavailable",
          ...(feeds.mode === "public" && origin && (item.seatsRemaining > 0 || item.waitlistAvailable) &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.releaseId)
            ? {link: {href: origin + "/learn/enroll?release=" + encodeURIComponent(item.releaseId),
              label: item.seatsRemaining > 0 ? "Register for training" : "Join the waitlist"}}
            : {}),
        }));
        break;
    }
    if (block.sort==="title") items.sort((a,b)=>a.title.localeCompare(b.title));
    if (block.sort==="upcoming") items.sort((a,b)=>{
      const first=a.startsAt ? Date.parse(a.startsAt) : Number.POSITIVE_INFINITY;
      const second=b.startsAt ? Date.parse(b.startsAt) : Number.POSITIVE_INFINITY;
      return first-second || a.title.localeCompare(b.title);
    });
    if (block.limit) items=items.slice(0,block.limit);
    return items.length ? [{...block, items}] : [];
  });
}

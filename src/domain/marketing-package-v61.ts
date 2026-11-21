import { z } from "zod";
import { containsProtectedInstitutionalClaim } from "./site-local-content";

/** Brand-independent source content. No Site theme, media blob or publication claim is stored here. */
export const marketingPurposeIds = ["site-announcement", "program-interest", "interest-invitation", "event-invitation"] as const;
export const marketingAudienceIds = [
  "families", "students", "adult-learners", "older-adults",
  "congregation", "community", "partners", "volunteers",
  "prospective-leaders", "employees", "supporters", "funders",
] as const;
export const marketingFormatIds = ["email", "flyer", "social", "handout", "qr-card"] as const;
export const marketingPackageStatusIds = ["draft", "archived"] as const;

/** Structured operator selections live inside the existing canonical Package content JSON.
 * These are private planning choices, not contact lists, authorization or a new CMS. */
export const outreachStepIdsV61 = ["who","message","highlight","action","channels","review"] as const;
export const outreachPlanSchemaV61 = z.object({
  relationship: z.enum(["known","new","both"]),
  recipients: z.array(z.enum(marketingAudienceIds)).max(8),
  beneficiaries: z.array(z.enum(["children","teens","adults","older_adults"])).max(4),
  messageFocus: z.enum(["coming-soon","feedback","invitation","recruiting","update"]),
  highlights: z.array(z.object({
    source: z.enum(["program","audience","experience","vision"]),
    id: z.string().trim().min(1).max(128),
    label: z.string().trim().min(2).max(100),
    role: z.enum(["primary","supporting"]),
  }).strict()).max(3),
  action: z.enum(["learn-more","express-interest","share-feedback","attend-event","schedule-conversation"]),
  channels: z.array(z.enum(["email","social","print","text","share-link","conversation-kit"])).max(6),
  storyAngle: z.enum(["impact","opportunity","partnership"]),
}).strict();
export type OutreachPlanV61 = z.infer<typeof outreachPlanSchemaV61>;
export function initialOutreachPlanV61(beneficiaries: OutreachPlanV61["beneficiaries"] = []): OutreachPlanV61 {
  return {
    relationship:"both",recipients:[],beneficiaries,
    messageFocus:"coming-soon",highlights:[],action:"learn-more",
    channels:["email","print","conversation-kit"],storyAngle:"impact",
  };
}
export function outreachFormatsV61(channels: OutreachPlanV61["channels"]): MarketingFormat[] {
  return [...new Set(channels.flatMap(channel =>
    channel==="email" ? ["email" as const] :
    channel==="social" ? ["social" as const] :
    channel==="print" ? ["flyer" as const] :
    channel==="conversation-kit" ? ["handout" as const] : []
  ))];
}
export function outreachStepIssueV61(step: typeof outreachStepIdsV61[number],
  title: string, content: MarketingPackageContent): string | null {
  const plan=content.plan;
  if(!plan)return "Choose the people you want to reach.";
  if(step==="who" && !plan.recipients.length)return "Choose at least one group to reach.";
  if(step==="highlight" && (!plan.highlights.length ||
      plan.highlights.filter(item=>item.role==="primary").length!==1))
    return "Choose one primary highlight and up to two supporting highlights.";
  if(step==="channels" && !plan.channels.length)return "Choose at least one way to reach people.";
  if(step==="review" && (!title.trim() || !content.headline.trim() || !content.message.trim()))return "Add a plan name and message before continuing.";
  return null;
}


/** Deterministic editorial starting point until Site Intelligence is integrated.
 * It reflects operator-selected planning interests, never approved offerings. */
export function composeOutreachDraftV61(siteName: string, plan: OutreachPlanV61) {
  const focus=plan.highlights.find(item=>item.role==="primary")?.label ??
    "community learning opportunities";
  const supporting=plan.highlights.filter(item=>item.role==="supporting")
    .map(item=>item.label);
  const beneficiaries=plan.beneficiaries.map(id=>({
    children:"children",teens:"teens",adults:"adults",older_adults:"older adults",
  }[id])).join(" and ");
  const recipientText=plan.recipients.includes("partners")?"community partners":
    plan.recipients.includes("prospective-leaders")?"prospective leaders":
    plan.recipients.includes("employees")?"prospective team members":
    plan.recipients.includes("families")?"families":"community members";
  const objective={
    "coming-soon":"Something new is taking shape",
    feedback:"What would you like to see?",
    invitation:"You're invited to shape what's next",
    recruiting:"Help us build something meaningful",
    update:"An update on our learning community",
  }[plan.messageFocus];
  const angle={
    impact:"help create meaningful opportunities",
    opportunity:"open the door to new learning possibilities",
    partnership:"explore how we can work together",
  }[plan.storyAngle];
  const cta={
    "learn-more":"Learn about our plans",
    "express-interest":"Express interest",
    "share-feedback":"Share your thoughts",
    "attend-event":"Learn about a future event",
    "schedule-conversation":"Request a conversation",
  }[plan.action];
  const message="At "+siteName+", we're exploring "+focus+
    (supporting.length?", with interests such as "+supporting.join(" and "):"")+
    (beneficiaries?", for "+beneficiaries:"")+
    ". These are proposed opportunities, and details have not been finalized. "+
    "We'd love to connect with "+recipientText+" to "+angle+
    ". Your ideas and participation can help shape what comes next.";
  return {
    headline:(objective+" at "+siteName).slice(0,160),
    message:message.slice(0,1600),
    callToAction:cta,
  };
}

export const marketingMaterialOverrideSchemaV61=z.object({
  headline:z.string().trim().max(160).optional(),
  message:z.string().trim().max(1600).optional(),
  callToAction:z.string().trim().max(100).optional(),
}).strict();
export const marketingPackageContentSchema = z.object({
  purpose: z.enum(marketingPurposeIds),
  audiences: z.array(z.enum(marketingAudienceIds)).max(8),
  geography: z.string().trim().max(120),
  headline: z.string().trim().max(160),
  message: z.string().trim().max(1600),
  callToAction: z.string().trim().max(100),
  formats: z.array(z.enum(marketingFormatIds)).max(5),
  plan: outreachPlanSchemaV61.optional(),
  materialOverrides:z.object({
    email:marketingMaterialOverrideSchemaV61.optional(),
    flyer:marketingMaterialOverrideSchemaV61.optional(),
    social:marketingMaterialOverrideSchemaV61.optional(),
    handout:marketingMaterialOverrideSchemaV61.optional(),
    "qr-card":marketingMaterialOverrideSchemaV61.optional(),
  }).strict().optional(),
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
    [title,content.headline,content.message,content.callToAction,
      ...Object.values(content.materialOverrides??{}).flatMap(value=>
        [value?.headline??"",value?.message??"",value?.callToAction??""])].join(" "),
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
  { id: "prospective-leaders", label: "Prospective leaders" },
  { id: "employees", label: "Prospective employees" },
  { id: "supporters", label: "Supporters and donors" },
  { id: "funders", label: "Funders and institutions" },
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

export const marketingPackageSteps = ["menu", "audience", "messages", "assets"] as const;
export type MarketingPackageStep = (typeof marketingPackageSteps)[number];

/** Editing is allowed at any step; completion guidance never authorizes sending or publication. */
export function marketingStepIssue(step: MarketingPackageStep, title: string, content: MarketingPackageContent): string | null {
  if (step === "menu" && !title.trim()) return "Name this package before continuing.";
  if (step === "audience" && !content.audiences.length) return "Select at least one audience.";
  if (step === "messages" && (!content.headline.trim() || !content.message.trim()))
    return "Add both a headline and a message.";
  if (step === "assets" && !content.formats.length) return "Select at least one format.";
  return null;
}

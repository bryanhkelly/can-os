import type { SiteStoryV61 } from "./site-information-v61";
import { siteLocalContentLimits, type WebsiteStarterField } from "./site-local-content";

export type WebsiteStoryCandidate = { field: WebsiteStarterField; text: string; reason: string };
const labels: Readonly<Record<string, string>> = {
  access: "access", belonging: "belonging", personalized: "individual growth",
  practical: "practical learning", alternative: "flexible possibilities",
  creative: "creative expression", character: "character", need: "community needs",
  flexible: "flexibility", community: "community connection", personal: "personal attention",
  "hands-on": "hands-on discovery", faith: "faith", service: "service",
  technology: "technology", curiosity: "curiosity", excellence: "excellence",
  integrity: "integrity", creativity: "creativity", opportunity: "opportunity",
  family: "family", known: "being known", confidence: "confidence",
  interests: "individual interests", mastery: "mastery", skills: "skills",
  purpose: "purpose",
};
const human = (value: readonly string[], max = 3) =>
  value.slice(0, max).map(part => labels[part] ?? "").filter(Boolean).join(", ");
const trim = (field: WebsiteStarterField, text: string) =>
  text.slice(0, siteLocalContentLimits[field]).trimEnd();

/** Private, deterministic candidates from saved Site Story checkboxes.
 * Never copies private narrative text, invents records, or alters original answers.
 * The website editor must explicitly Apply each candidate; none is auto-saved. */
export function suggestWebsiteCopyFromStory(story: SiteStoryV61 | null, siteName: string):
  WebsiteStoryCandidate[] {
  if (!story || ![...story.motivations, ...story.values, ...story.distinctives, ...story.experiences].length)
    return [];
  const name = siteName.trim().slice(0, 80) || "Our Site";
  const values = human(story.values);
  const motivations = human(story.motivations);
  const distinctives = human(story.distinctives);
  const experiences = human(story.experiences);
  const proposal: WebsiteStoryCandidate[] = [];
  if (motivations) proposal.push({ field:"heroHeadline",
    text:trim("heroHeadline", "A place for " + motivations + "."),
    reason:"Based on the motivations selected in Site Information." });
  if (values) proposal.push({ field:"welcomeMessage",
    text:trim("welcomeMessage", "We're working toward a learning community shaped by " +
      values + ". Join us as we develop this vision together."),
    reason:"Based on the values selected in Site Information." });
  if (motivations || distinctives) proposal.push({ field:"localDescription",
    text:trim("localDescription", "At " + name + ", our aim is to create a learning community focused on " +
      [motivations, distinctives].filter(Boolean).join(" and ") +
      ". We are still shaping how that vision will come to life."),
    reason:"Based on your Site motivations and planned distinctive qualities." });
  if (experiences || values) proposal.push({ field:"schoolVision",
    text:trim("schoolVision", "We envision a learning community where " +
      (experiences ? experiences : values) +
      " help young people explore their potential and prepare for what comes next."),
    reason:"Based on your desired learner experiences and values." });
  if (story.motivations.includes("access") || story.distinctives.includes("community") ||
      story.values.includes("service") || story.distinctives.includes("service"))
    proposal.push({ field:"communityOutreach",
      text:"We hope to listen to neighbors, build meaningful partnerships and develop ways to serve our community as this Site grows.",
      reason:"Based on the community, access or service priorities in Site Information." });
  return proposal;
}

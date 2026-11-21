import type { SiteEnrollmentOpportunity } from "./site-enrollment-opportunities";
import { enrollmentOpportunityKinds } from "./site-enrollment-opportunities";
import type { SiteLaunchPreferences } from "./site-launch-preferences";

export type SiteExperienceProfile =
  "school" | "community" | "training" | "older-adult" | "lifelong" | "mixed";

type PlannedIntent = Pick<SiteLaunchPreferences, "interestIds" | "audienceIds">;

/** Establish describes a proposed audience, not an authorized offering.
 * The returned profile is only an editorial direction for private previews. */
export function resolvePlannedSiteExperience(
  preferences: PlannedIntent | null | undefined,
): SiteExperienceProfile | null {
  if (!preferences) return null;
  const interests = new Set(preferences.interestIds);
  const audiences = new Set(preferences.audienceIds ?? []);
  const school = interests.has("grades-6-8") || interests.has("grades-9-12");
  const adult = interests.has("adult") || audiences.has("adults");
  const older = interests.has("senior") || audiences.has("older_adults");
  if (school && (adult || older)) return "mixed";
  if (school) return "school";
  if (adult && older) return "lifelong";
  if (older) return "older-adult";
  if (adult) return "training";
  if (interests.size || audiences.size) return "community";
  return null;
}

/** Published opportunities determine what can actually operate. Planning
 * intent may shape the PRIVATE preview when no conflicting authorized school
 * exists. Public pages never pass speculative planning preferences. */
export function resolveSiteExperienceProfile(
  opportunities: readonly SiteEnrollmentOpportunity[],
  planning: PlannedIntent | null = null,
): SiteExperienceProfile {
  const kinds = enrollmentOpportunityKinds(opportunities);
  const academic = kinds.school;
  const training = kinds.course || kinds.class;
  const community = kinds.program;
  const desired = resolvePlannedSiteExperience(planning);
  if (academic) return training || community || (desired !== null && desired !== "school")
    ? "mixed" : "school";
  if (desired) return desired;
  if (training && !community) return "training";
  return "community";
}

export const siteExperienceCopy: Record<SiteExperienceProfile, {
  navLabel: string; heroWelcome: string; heroIntro: string;
  heroExplore: string; heroExplorePath: "/academics" | "/programs" | "/courses";
  storyTitle: string; visionTitle: string; contactTitle: string;
}> = {
  school: {
    navLabel: "School website navigation", heroWelcome: "Welcome to our school",
    heroIntro: "Explore reviewed academic Programs, our learning approach and the next step available to families.",
    heroExplore: "Explore academics", heroExplorePath: "/academics",
    storyTitle: "A school community shaped by people and purpose",
    visionTitle: "Helping students discover who they are and what they can become.",
    contactTitle: "Start a conversation about your child's education",
  },
  community: {
    navLabel: "Learning center website navigation", heroWelcome: "Welcome to our learning community",
    heroIntro: "Explore learning interests and community connections. Offerings and enrollment are confirmed separately.",
    heroExplore: "Explore Programs", heroExplorePath: "/programs",
    storyTitle: "A learning community shaped by people and purpose",
    visionTitle: "Learning, connection and opportunity in our community.",
    contactTitle: "Start a conversation about learning",
  },
  training: {
    navLabel: "Adult learning website navigation", heroWelcome: "Welcome to adult learning",
    heroIntro: "Explore adult learning, skills and enrichment. Current registration is available only for authorized offerings.",
    heroExplore: "Explore Courses", heroExplorePath: "/courses",
    storyTitle: "Learning that fits your life",
    visionTitle: "Opportunities to keep growing at every stage.",
    contactTitle: "Ask about adult learning",
  },
  "older-adult": {
    navLabel: "Older adult learning website navigation", heroWelcome: "Welcome to lifelong learning",
    heroIntro: "Explore learning, connection and enrichment for older adults. Programs are confirmed separately.",
    heroExplore: "Explore Programs", heroExplorePath: "/programs",
    storyTitle: "Connection and discovery at every age",
    visionTitle: "A place for curiosity and connection at every age.",
    contactTitle: "Connect about older adult learning",
  },
  lifelong: {
    navLabel: "Adult and older adult learning navigation", heroWelcome: "Learning for every chapter of life",
    heroIntro: "Explore learning and community experiences for adults and older adults. Offerings are confirmed separately.",
    heroExplore: "Explore Programs", heroExplorePath: "/programs",
    storyTitle: "Keep learning. Keep connecting.",
    visionTitle: "Opportunities to learn and connect throughout life.",
    contactTitle: "Ask about lifelong learning",
  },
  mixed: {
    navLabel: "Education and learning website navigation", heroWelcome: "Welcome to our learning community",
    heroIntro: "Explore learning interests across age groups and independently reviewed enrollment opportunities.",
    heroExplore: "Explore Programs", heroExplorePath: "/programs",
    storyTitle: "More ways to learn and connect",
    visionTitle: "Learning opportunities across generations.",
    contactTitle: "Start a conversation about learning",
  },
};

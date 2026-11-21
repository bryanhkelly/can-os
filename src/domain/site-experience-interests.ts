import type { SiteProgramsAudiencesV61 } from "./site-launch-preferences";

/** Editorial categories, not adopted Solutions, scheduled Classes or Offerings.
 * Their program/audience associations only rank suggestions during Establish. */
export const siteExperienceIds = [
  "digital-confidence", "career-skills", "arts-creativity", "wellness-movement",
  "social-connection", "trips-excursions", "financial-literacy", "community-service",
  "science-makers", "study-support", "languages-cultures", "clubs-leadership",
  "outdoor-discovery", "family-learning",
] as const;
export type SiteExperienceId = (typeof siteExperienceIds)[number];
export type SiteExperienceAudienceId = SiteProgramsAudiencesV61["audienceIds"][number];
export type SiteExperienceProgramId = SiteProgramsAudiencesV61["interestIds"][number];

export type SiteExperienceCategory = {
  id: SiteExperienceId;
  title: string;
  description: string;
  programs: readonly SiteExperienceProgramId[];
  audiences: readonly SiteExperienceAudienceId[];
};

export const siteExperienceCatalog: readonly SiteExperienceCategory[] = [
  {id:"digital-confidence", title:"Digital Confidence",
    description:"Everyday technology, online safety and practical digital skills",
    programs:["adult","senior","afterschool","summer"],
    audiences:["teens","adults","older_adults"]},
  {id:"career-skills", title:"Career & Job Skills",
    description:"Workplace readiness, career exploration and professional growth",
    programs:["adult","grades-9-12","summer"], audiences:["teens","adults"]},
  {id:"arts-creativity", title:"Arts & Creativity",
    description:"Art, music, photography, storytelling and creative exploration",
    programs:["grades-6-8","grades-9-12","afterschool","summer","adult","senior"],
    audiences:["children","teens","adults","older_adults"]},
  {id:"wellness-movement", title:"Health & Wellness",
    description:"Movement, nutrition and learning about healthy living",
    programs:["afterschool","summer","adult","senior"],
    audiences:["children","teens","adults","older_adults"]},
  {id:"social-connection", title:"Social & Community",
    description:"Shared interests, discussion groups and community connection",
    programs:["afterschool","summer","adult","senior"],
    audiences:["children","teens","adults","older_adults"]},
  {id:"trips-excursions", title:"Trips & Excursions",
    description:"Cultural outings, local discovery and group experiences",
    programs:["afterschool","summer","adult","senior"],
    audiences:["children","teens","adults","older_adults"]},
  {id:"financial-literacy", title:"Financial Literacy",
    description:"Budgeting, everyday money decisions and practical financial learning",
    programs:["grades-9-12","adult","senior"],
    audiences:["teens","adults","older_adults"]},
  {id:"community-service", title:"Service & Volunteering",
    description:"Community projects and meaningful ways to contribute",
    programs:["grades-6-8","grades-9-12","afterschool","summer","adult","senior"],
    audiences:["teens","adults","older_adults"]},
  {id:"science-makers", title:"STEM & Making",
    description:"Technology, science, design and hands-on discovery",
    programs:["grades-6-8","grades-9-12","afterschool","summer","adult"],
    audiences:["children","teens","adults"]},
  {id:"study-support", title:"Study & Academic Support",
    description:"Study groups, mentoring and learning habits",
    programs:["grades-6-8","grades-9-12","afterschool","summer"],
    audiences:["children","teens"]},
  {id:"languages-cultures", title:"Languages & Culture",
    description:"Languages, traditions and cultural discovery",
    programs:["grades-6-8","grades-9-12","afterschool","summer","adult","senior"],
    audiences:["children","teens","adults","older_adults"]},
  {id:"clubs-leadership", title:"Clubs & Leadership",
    description:"Interest clubs, peer learning and leadership practice",
    programs:["grades-6-8","grades-9-12","afterschool","summer","adult","senior"],
    audiences:["children","teens","adults","older_adults"]},
  {id:"outdoor-discovery", title:"Outdoors & Nature",
    description:"Gardening, nature exploration and outdoor interests",
    programs:["afterschool","summer","adult","senior"],
    audiences:["children","teens","adults","older_adults"]},
  {id:"family-learning", title:"Family Learning",
    description:"Shared activities, family workshops and intergenerational learning",
    programs:["afterschool","summer","adult","senior"],
    audiences:["children","teens","adults","older_adults"]},
];

export const siteExperienceAudienceNames: Record<SiteExperienceAudienceId,string> = {
  children:"Children", teens:"Teens", adults:"Adults", older_adults:"Older adults",
};
export const siteExperienceProgramNames: Record<SiteExperienceProgramId,string> = {
  "grades-6-8":"Grades 6–8", "grades-9-12":"Grades 9–12",
  afterschool:"After-school", summer:"Summer & Breaks",
  adult:"Adult Learning", senior:"Older Adult Learning",
};

/** An operator may retain a chosen Experience after changing their audience.
 * Filtering and suggested ordering never delete saved Site intent. */
export function suggestedSiteExperiences(
  intent: Pick<SiteProgramsAudiencesV61,"interestIds"|"audienceIds">,
): SiteExperienceCategory[] {
  return siteExperienceCatalog.filter(item =>
    (!intent.interestIds.length || item.programs.some(id=>intent.interestIds.includes(id))) &&
    (!intent.audienceIds.length || item.audiences.some(id=>intent.audienceIds.includes(id))));
}

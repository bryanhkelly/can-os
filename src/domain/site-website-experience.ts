import type { SiteEnrollmentOpportunity } from "./site-enrollment-opportunities";
import { enrollmentOpportunityKinds } from "./site-enrollment-opportunities";

export type SiteExperienceProfile="school"|"community"|"training"|"mixed";
/** Experience comes from published content, not speculative Site Setup chips. */
export function resolveSiteExperienceProfile(
  opportunities:readonly SiteEnrollmentOpportunity[],
):SiteExperienceProfile {
  const kinds=enrollmentOpportunityKinds(opportunities);
  const academic=kinds.school;
  const training=kinds.course||kinds.class;
  const community=kinds.program;
  if(academic&&(training||community))return "mixed";
  if(academic)return "school";
  if(training&&!community)return "training";
  return "community";
}
export const siteExperienceCopy:Record<SiteExperienceProfile,{
  navLabel:string;heroWelcome:string;heroIntro:string;
  heroExplore:string;heroExplorePath:"/academics"|"/programs"|"/courses";
  storyTitle:string;
}>={
  school:{
    navLabel:"School website navigation",heroWelcome:"Welcome to our school",
    heroIntro:"Explore reviewed academic Programs, our learning approach and the next step available to families.",
    heroExplore:"Explore academics",heroExplorePath:"/academics",
    storyTitle:"A school community shaped by people and purpose",
  },
  community:{
    navLabel:"Learning center website navigation",heroWelcome:"Welcome to our learning community",
    heroIntro:"Explore published community Programs and learning experiences available at this Site.",
    heroExplore:"Explore Programs",heroExplorePath:"/programs",
    storyTitle:"A learning community shaped by people and purpose",
  },
  training:{
    navLabel:"Training provider website navigation",heroWelcome:"Discover your next learning experience",
    heroIntro:"Discover published Courses and scheduled Classes, with current registration information where authorized.",
    heroExplore:"Explore Courses",heroExplorePath:"/courses",
    storyTitle:"Learning that fits your life",
  },
  mixed:{
    navLabel:"Education and learning website navigation",heroWelcome:"Welcome to our learning community",
    heroIntro:"Explore Schools, Programs, Courses and Classes with independently reviewed next steps.",
    heroExplore:"Explore Programs",heroExplorePath:"/programs",
    storyTitle:"More ways to learn and connect",
  },
};

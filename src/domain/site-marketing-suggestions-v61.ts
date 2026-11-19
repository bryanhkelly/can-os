import type { SiteStoryV61 } from "./site-information-v61";
import type { SiteProgramsAudiencesV61 } from "./site-launch-preferences";
import { containsProtectedInstitutionalClaim } from "./site-local-content";
import {
  initialMarketingContent, type MarketingPackageContent, type MarketingPurpose,
} from "./marketing-package-v61";

/**
 * Editorial starter only. Sources are privately recorded in Establish and are
 * NOT factual approval to operate, publish courses or invite enrollment.
 * Free-form founding/needs narratives are never copied automatically.
 */
export type MarketingStarterSourcesV61 = {
  story: SiteStoryV61 | null;
  intent: SiteProgramsAudiencesV61 | null;
  websiteCopy: {
    heroHeadline?: string | null;
    welcomeMessage?: string | null;
    schoolVision?: string | null;
    communityOutreach?: string | null;
  } | null;
};
export type MarketingStarterSuggestionV61 = {
  content: MarketingPackageContent;
  sources: readonly string[];
  websiteAlternative: { headline: string; message: string; source: string } | null;
};
const priorityLabels = {
  "grades-6-8": "middle school learning",
  "grades-9-12": "high school learning",
  afterschool: "after-school activities",
  summer: "summer learning",
  adult: "adult learning",
  senior: "learning opportunities for older adults",
} as const;
const valueLabels: Readonly<Record<string,string>> = {
  belonging:"belonging",curiosity:"curiosity",excellence:"excellence",
  integrity:"integrity",creativity:"creativity",service:"service",
  opportunity:"opportunity",family:"family partnership",
  access:"educational access",personalized:"individual attention",
  practical:"practical skills",alternative:"more learning choices",
  creative:"creative opportunities",character:"character and leadership",
  need:"community needs",flexible:"flexibility",community:"community connection",
  personal:"personal learning","hands-on":"hands-on discovery",
  faith:"faith and service",technology:"technology",
  known:"being known",confidence:"confidence",interests:"individual interests",
  mastery:"mastery",skills:"practical skills",purpose:"purpose",
};
const safeText=(value:string,limit:number)=>value.replace(/[<>\u0000-\u001f]/g," ")
  .replace(/\s+/g," ").trim().slice(0,limit);
const phrase=(values:readonly string[],limit=2)=>values.slice(0,limit)
  .map(value=>valueLabels[value]??"").filter(Boolean).join(" and ");

function websiteAlternative(
  website:MarketingStarterSourcesV61["websiteCopy"],
):MarketingStarterSuggestionV61["websiteAlternative"] {
  if(!website)return null;
  // Website text is a PRIVATE suggestion until the operator explicitly applies
  // it. Do not silently substitute it for independently edited package copy.
  const headline=safeText(website.heroHeadline??"",160);
  const message=safeText(website.communityOutreach || website.schoolVision ||
    website.welcomeMessage || "",1000);
  if(!message || containsProtectedInstitutionalClaim(headline+" "+message))return null;
  return {headline,message,source:"Saved Website & Brand copy"};
}

export function suggestMarketingStarterV61(
  siteName:string, purpose:MarketingPurpose, source:MarketingStarterSourcesV61,
):MarketingStarterSuggestionV61 {
  const content=initialMarketingContent(siteName,purpose);
  const sources:string[]=[];
  const name=safeText(siteName,100)||"our learning community";
  const story=source.story;
  const intent=source.intent;
  const priority=intent?.startingFocus ?? intent?.interestIds[0] ?? null;
  const focus=priority ? priorityLabels[priority] : "";
  const secondFocus=intent?.interestIds.filter(id=>id!==priority)
    .slice(0,1).map(id=>priorityLabels[id]).join("")??"";
  const emphasis=story ? phrase(story.values.length?story.values:story.motivations) : "";
  const approach=story ? phrase(story.distinctives) : "";
  const outcome=story ? phrase(story.experiences) : "";
  if(emphasis||approach||outcome)sources.push("Site Information · Purpose & Story");
  if(focus)sources.push("Establish · Programs & Audiences");
  const mission=emphasis ? "shaped by "+emphasis
    : approach ? "focused on "+approach : "rooted in community";
  const experience=outcome ? " We hope learners experience "+outcome+"."
    : approach ? " We hope to create space for "+approach+".":"";
  const focusLine=focus
    ? " Our early interests include "+focus+(secondFocus?" and "+secondFocus:"")+
      "; offerings and dates are still being planned." : "";
  let headline=content.headline;
  let message=content.message;
  switch(purpose){
    case "site-announcement":
      if(sources.length){
        headline="A learning community "+mission+" is taking shape.";
        message="At "+name+", we are exploring a new learning community "+mission+
          "."+experience+focusLine+
          " We'd love to hear what matters to the people we hope to serve.";
      }
      break;
    case "program-interest":
      if(focus){
        headline="Exploring "+focus+" for our community.";
        message=name+" is exploring "+focus+" and gathering input before any offerings are finalized."+
          (emphasis?" Our vision is "+emphasis+".":"")+
          " Tell us which learning experiences would be meaningful to you.";
      }
      break;
    case "interest-invitation":
      if(sources.length){
        headline="Help shape what comes next at "+name+".";
        message="We're listening to families, neighbors and future learners as we explore a community "+
          (mission==="rooted in community"?"learning experience": "learning experience "+mission)+
          "."+focusLine+" Your perspective can help shape our next steps.";
      }
      break;
    case "event-invitation":
      if(sources.length){
        headline="Join the conversation about learning at "+name+".";
        message="We're planning a chance to share the vision for "+name+
          (focus?" including ideas for "+focus:"")+
          ". Meeting details will be announced once confirmed. We'd value your questions and ideas.";
      }
      break;
  }
  content.headline=safeText(headline,160);
  content.message=safeText(message,1600);
  const alternative=websiteAlternative(source.websiteCopy);
  return {content,sources,websiteAlternative:alternative};
}

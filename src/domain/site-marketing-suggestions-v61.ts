import type { SiteStoryV61 } from "./site-information-v61";
import { siteIdentityEditorialContextV61, type SiteIdentityV61 } from "./site-identity-v61";
import type { SiteProgramsAudiencesV61 } from "./site-launch-preferences";
import type { SiteContentExperienceV61 } from "./site-content-brief-v61";
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
  /** No prior Site content is reused in marketing unless explicitly authorized. */
  reuseAllowed?: boolean;
  story: SiteStoryV61 | null;
  /** Site identity is self-described and used only for operator-reviewed drafts. */
  identity?: SiteIdentityV61 | null;
  intent: SiteProgramsAudiencesV61 | null;
  experiences?: readonly SiteContentExperienceV61[];
  /** Active published CAN Program titles; no Solution requirements or approvals. */
  publishedPrograms?: readonly {code:string;title:string}[];
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
  // The Site can still write a package manually when it declines reuse.
  if(source.reuseAllowed !== true){
    return {content:{...content,headline:"",message:"",audiences:[]},sources:[],websiteAlternative:null};
  }
  const sources:string[]=[];
  const name=safeText(siteName,100)||"our learning community";
  const story=source.story;
  const identity=source.identity??null;
  const communityKind=siteIdentityEditorialContextV61(identity).kind;
  const intent=source.intent;
  // Establish names intended learners, not recipient contacts. Preselect a
  // suggested communication audience without importing personal information.
  const audienceFromPlan={
    children:"families",teens:"students",adults:"adult-learners",
    older_adults:"older-adults",
  } as const;
  if(intent?.audienceIds.length){
    content.audiences=[...new Set(intent.audienceIds.map(id=>audienceFromPlan[id]))];
  }
  const selectedPrograms=(intent?.programCodes??[])
    .map(code=>source.publishedPrograms?.find(program=>program.code===code))
    .filter((program):program is {code:string;title:string}=>Boolean(program))
    .filter(program=>!containsProtectedInstitutionalClaim(program.title));
  const preferredProgram=selectedPrograms.find(program=>
    program.code===intent?.startingProgramCode)??selectedPrograms[0];
  const priority=intent?.startingFocus ?? intent?.interestIds[0] ?? null;
  const fallbackFocus=priority ? priorityLabels[priority] : "";
  const experience=source.experiences?.find(item=>item.priority==="featured") ??
    source.experiences?.[0];
  const focus=preferredProgram ? safeText(preferredProgram.title,90)
    : experience ? safeText(experience.title,90) : fallbackFocus;
  const secondFocus=preferredProgram
    ? selectedPrograms.filter(program=>program.code!==preferredProgram.code)
      .slice(0,1).map(program=>safeText(program.title,90)).join("")
    : intent?.interestIds.filter(id=>id!==priority)
      .slice(0,1).map(id=>priorityLabels[id]).join("")??"";
  const emphasis=story ? phrase(story.motivations) : "";
  const approach=story ? phrase(story.distinctives) : "";
  const outcome=story ? phrase(story.experiences) : "";
  if(identity)sources.push("Site Information · Site identity");
  if(emphasis||approach||outcome)sources.push("Site Information · Purpose & Story");
  if(focus)sources.push("Establish · Programs & Audiences");
  if(experience)sources.push("Establish · Experiences");
  const mission=emphasis ? "shaped by "+emphasis
    : approach ? "focused on "+approach
    : identity?.faithOrientation==="faith_based" ? "inspired by faith and service"
    : "rooted in community";
  const aspiration=outcome ? " We hope participants experience "+outcome+"."
    : approach ? " We hope to create space for "+approach+".":"";
  const experienceLine=experience?.activities.length
    ? " Proposed activities could include "+
      experience.activities.slice(0,2).map(item=>safeText(item,75)).join(" and ")+"."
    : "";
  const focusLine=focus
    ? " Our early interests include "+focus+(secondFocus?" and "+secondFocus:"")+
      "; offerings and dates are still being planned." : "";
  let headline=content.headline;
  let message=content.message;
  switch(purpose){
    case "site-announcement":
      if(sources.length){
        headline="A "+communityKind+" "+mission+" is taking shape.";
        message="At "+name+", we are exploring a new "+communityKind+" "+mission+
          "."+aspiration+focusLine+experienceLine+
          " We'd love to hear what matters to the people we hope to serve.";
      }
      break;
    case "program-interest":
      if(focus){
        headline="Exploring "+focus+" for our community.";
        message=name+" is exploring "+focus+" and gathering input before any offerings are finalized."+
          (emphasis?" Our vision is "+emphasis+".":"")+experienceLine+
          " Tell us which learning experiences would be meaningful to you.";
      }
      break;
    case "interest-invitation":
      if(sources.length){
        headline="Help shape what comes next at "+name+".";
        message="We're listening to families, neighbors and future learners as we explore a community "+
          (mission==="rooted in community"?"learning experience": "learning experience "+mission)+
          "."+focusLine+experienceLine+" Your perspective can help shape our next steps.";
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

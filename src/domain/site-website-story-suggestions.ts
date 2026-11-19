import type { SiteStoryV61 } from "./site-information-v61";
import {
  containsProtectedInstitutionalClaim, siteLocalContentLimits,
  type SiteLocalContent, type WebsiteStarterField,
} from "./site-local-content";

/** Source-derived website drafts, never independent institutional facts. */
export type WebsiteStoryCandidate = {
  field: WebsiteStarterField;
  text: string;
  reason: string;
  sourceFields: ReadonlyArray<keyof SiteStoryV61>;
};

const labels: Readonly<Record<string, string>> = {
  access: "greater educational access", belonging: "belonging",
  personalized: "personalized learning", practical: "practical skills",
  alternative: "more choices", creative: "creative opportunities",
  character: "character and leadership", need: "community needs",
  flexible: "flexibility", community: "community connection",
  personal: "individual attention", "hands-on": "hands-on discovery",
  faith: "faith", service: "service", technology: "technology",
  curiosity: "curiosity", excellence: "excellence", integrity: "integrity",
  creativity: "creativity", opportunity: "opportunity", family: "family partnership",
  known: "being known", confidence: "confidence", interests: "individual interests",
  mastery: "mastery", skills: "practical skills", purpose: "purpose",
};
const human = (values: readonly string[], max = 3) => values.slice(0,max)
  .map(item => labels[item] ?? item).filter(Boolean).join(", ");

const cleanNarrative = (value: string): string => value
  .replace(/[<>\u0000-\u001f]/g, " ").replace(/\s+/g," ").trim();

/** Respect field bounds without cutting a word in half. The full written source
 * remains intact in Site Information; the draft is deliberately editable. */
function fit(field: WebsiteStarterField, text: string): string {
  const safe = cleanNarrative(text);
  const limit = siteLocalContentLimits[field];
  if (safe.length <= limit) return safe;
  const excerpt = safe.slice(0, limit - 1);
  const wordEnd = excerpt.lastIndexOf(" ");
  return (wordEnd > limit * .6 ? excerpt.slice(0,wordEnd) : excerpt).trimEnd() + "…";
}
function summary(field:WebsiteStarterField, value:string) {
  const safe=cleanNarrative(value);
  const first=safe.match(/^.+?[.!?](?=\s|$)/)?.[0];
  return fit(field, first && first.length > 32 ? first : safe);
}

/**
 * Derive website copy from EVERY saved Purpose & Story field: free-text
 * community need, founding story and future vision plus four multi-choice
 * groups. This is a deterministic editorial draft, not AI fact extraction.
 *
 * The caller shows the candidates only to authorized editors. Nothing is
 * published, shared, or saved until the operator reviews and acts.
 * Protected institutional claims remain subject to the existing safety gates.
 */
export function suggestWebsiteCopyFromStory(story: SiteStoryV61 | null, siteName: string):
  WebsiteStoryCandidate[] {
  if (!story || !Object.values(story).some(value =>
    Array.isArray(value) ? value.length : String(value).trim().length)) return [];

  const name = cleanNarrative(siteName).slice(0,80) || "Our learning community";
  const values = human(story.values);
  const motivations = human(story.motivations);
  const distinctives = human(story.distinctives);
  const experiences = human(story.experiences);
  const communityNeed = cleanNarrative(story.communityNeed);
  const foundingStory = cleanNarrative(story.foundingStory);
  const futureVision = cleanNarrative(story.futureVision);
  const candidates:WebsiteStoryCandidate[]=[];
  const add=(field:WebsiteStarterField,text:string,reason:string,
    sourceFields:ReadonlyArray<keyof SiteStoryV61>)=>{
    const result=fit(field,text);
    if(result) candidates.push({field,text:result,reason,sourceFields});
  };

  if(motivations)
    add("heroHeadline", "A community built for " + motivations + ".",
      "Based on the reasons you selected for creating this Site.", ["motivations"]);
  else if(values)
    add("heroHeadline", "A place shaped by " + values + ".",
      "Based on your selected community values.", ["values"]);
  else if(futureVision)
    add("heroHeadline", summary("heroHeadline",futureVision),
      "Adapted from your written future vision.",["futureVision"]);

  if(experiences)
    add("welcomeMessage", "We hope every learner experiences " + experiences +
      " as we build this community together.",
      "Based on the experiences you hope learners will have.",["experiences"]);
  else if(values || distinctives)
    add("welcomeMessage", "Our vision is a learning community shaped by " +
      [values,distinctives].filter(Boolean).join(" and ") + ".",
      "Based on your selected values and approach.",["values","distinctives"]);
  else if(communityNeed)
    add("welcomeMessage", summary("welcomeMessage",communityNeed),
      "Adapted from your description of the community need.",["communityNeed"]);

  if(foundingStory)
    add("localDescription", foundingStory,
      "Adapted from your written origin story. Review names and details before sharing.",
      ["foundingStory"]);
  else if(communityNeed)
    add("localDescription", "At " + name + ", our aim is to respond to a need in our community: " + communityNeed,
      "Adapted from your written description of the community need.",["communityNeed"]);
  else if(motivations || distinctives)
    add("localDescription","At " + name + ", we are building a learning community centered on "+
      [motivations,distinctives].filter(Boolean).join(" and ")+".",
      "Based on your saved reasons and planned distinctive qualities.",["motivations","distinctives"]);

  if(futureVision)
    add("schoolVision",futureVision,
      "Adapted from your written vision for what this community could become.",
      ["futureVision"]);
  else if(values || experiences)
    add("schoolVision","We envision a learning community where " +
      [experiences,values].filter(Boolean).join(" and ") +
      " help people discover what is possible.",
      "Based on your selected values and desired learner experiences.",["values","experiences"]);

  if(communityNeed)
    add("communityOutreach", communityNeed,
      "Adapted from the need you described in Site Information. Check whether it reads as a public-facing invitation.",
      ["communityNeed"]);
  else if(story.motivations.includes("access") || story.distinctives.includes("community") ||
      story.values.includes("service") || story.distinctives.includes("service"))
    add("communityOutreach",
      "We hope to listen to neighbors, build meaningful partnerships and develop ways to serve our community.",
      "Based on your community, access and service priorities.",["motivations","distinctives","values"]);

  return candidates;
}

/** Auto-compose an UNPERSISTED new Site website from saved source information.
 * Returning visitors with saved website revisions never lose their edits.
 * Existing claims and material restrictions are still validated on save/share.
 */
export function prepareWebsiteCopyFromSiteInformation(
  base: SiteLocalContent, candidates:readonly WebsiteStoryCandidate[],
): SiteLocalContent {
  if(!candidates.length) return base;
  const result={...base};
  for(const candidate of candidates) {
    // Do not auto-insert a legal/academic claim into a share-ready starter.
    // Operators can review the attributed suggestion field by field.
    if(containsProtectedInstitutionalClaim(candidate.text)) continue;
    const current=result[candidate.field]??"";
    const starter=base.editorialBaseline?.fields[candidate.field]??"";
    if(!current.trim() || current===starter) result[candidate.field]=candidate.text;
  }
  return result;
}

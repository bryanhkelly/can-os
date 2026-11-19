import type { SiteStoryV61 } from "./site-information-v61";
import type { SitePaletteId, SiteTemplateId } from "./site-theme";

/** Editorial aspirations only; never proof of qualifications, programs or accreditation. */
export const siteBrandDirectionIds = ["belonging","excellence","innovation","classical","creative","leadership"] as const;
export type SiteBrandDirectionId = (typeof siteBrandDirectionIds)[number];
export const siteBrandDirections: ReadonlyArray<{id:SiteBrandDirectionId;name:string;character:string;description:string}> = [
  {id:"belonging",name:"Community & Belonging",character:"Warm, supportive, people-first",description:"Connection, opportunity and a place to belong."},
  {id:"excellence",name:"Academic Excellence",character:"Confident, ambitious, focused",description:"A commitment to growth and preparation, not a verified outcome."},
  {id:"innovation",name:"Innovation & Discovery",character:"Curious, inventive, future-facing",description:"Exploration, technology and possibility."},
  {id:"classical",name:"Classical & Humanities",character:"Thoughtful, timeless, grounded",description:"Wisdom, knowledge and character."},
  {id:"creative",name:"Creative Expression",character:"Expressive, vibrant, original",description:"Artistic exploration and individual voice."},
  {id:"leadership",name:"Leadership & Service",character:"Purposeful, principled, service-oriented",description:"Responsibility, service and community impact."},
];
const words:Record<SiteBrandDirectionId,readonly string[]>={
  belonging:["community","belong","support","family","access","neighbor","relationship"],
  excellence:["academic","achievement","rigor","preparation","excellence","mastery"],
  innovation:["innovation","digital","technology","discovery","stem","curiosity"],
  classical:["classical","humanities","tradition","literature","wisdom","history"],
  creative:["creative","art","design","music","expression","imagination"],
  leadership:["leadership","character","service","mission","civic","purpose","responsibility"],
};
/** Conservative, explainable keyword suggestion from the real private Site Story. */
export function recommendBrandDirection(story:SiteStoryV61|null):SiteBrandDirectionId|null{
  if(!story)return null;
  const source=[...story.motivations,...story.distinctives,...story.values,...story.experiences,
    story.communityNeed,story.foundingStory,story.futureVision].join(" ").toLowerCase();
  if(!source.trim())return null;
  const ranked=siteBrandDirectionIds.map(id=>({id,count:words[id].filter(word=>source.includes(word)).length}))
    .sort((a,b)=>b.count-a.count);
  return ranked[0]?.count ? ranked[0].id : null;
}
const layout:Record<SiteBrandDirectionId,SiteTemplateId>={
  belonging:"community",excellence:"heritage",innovation:"modern",classical:"classic",
  creative:"bright-futures",leadership:"summit",
};
const palette:Record<SiteBrandDirectionId,SitePaletteId>={
  belonging:"brand-community",excellence:"brand-heritage",innovation:"brand-modern",
  classical:"brand-classic",creative:"brand-bright-futures",leadership:"brand-summit",
};
export const brandRecommendedLayout=(id:SiteBrandDirectionId)=>layout[id];
export const brandRecommendedPalette=(id:SiteBrandDirectionId)=>palette[id];

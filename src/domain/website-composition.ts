import {z} from "zod";
import {publicSitePagePaths,type PublicSitePath} from "./public-site-paths";

/** The registry describes only existing renderer slots. It is internal:
 * no arbitrary component, HTML, route, query, URL or user-facing blueprint. */
export const websiteHomeSectionIds=["hero","vision","story","explore","academics","enrichment","channelsLearning","channelsCommunity","closing","channelsClosing","contact"] as const;
export type WebsiteHomeSectionId=typeof websiteHomeSectionIds[number];
export const websiteCompositionSchema=z.object({
  schemaVersion:z.literal(1),
  navigation:z.array(z.enum(publicSitePagePaths)).min(1).max(publicSitePagePaths.length),
  homeSections:z.array(z.enum(websiteHomeSectionIds)).min(1).max(websiteHomeSectionIds.length),
}).strict().superRefine((value,ctx)=>{
  if(value.navigation[0]!=="/"||new Set(value.navigation).size!==value.navigation.length)
    ctx.addIssue({code:"custom",path:["navigation"],message:"Home must be first and routes unique"});
  if(value.homeSections[0]!=="hero"||new Set(value.homeSections).size!==value.homeSections.length)
    ctx.addIssue({code:"custom",path:["homeSections"],message:"Hero must be first and sections unique"});
});
export type WebsiteComposition=z.infer<typeof websiteCompositionSchema>;
export const websiteCompositionCapabilities={
  schemaVersion:1 as const,
  pageTypes:publicSitePagePaths,
  homeSectionTypes:websiteHomeSectionIds,
  rules:["Recommend a priority order; omitted eligible sections remain available.","No new routes, HTML, CSS, raw URLs or approval claims.","Published pages and actions are determined only by the authorized platform records."],
};
/** A recommendation orders eligible content, never grants access or removes
 * eligible pages. Newly launched Programs remain discoverable without AI. */
export function orderEligibleWebsitePages(eligible:readonly PublicSitePath[],composition?:WebsiteComposition|null):PublicSitePath[]{
  if(!composition)return [...eligible];
  const wanted=new Set(eligible);
  const ordered=composition.navigation.filter(path=>wanted.has(path));
  const seen=new Set(ordered);
  return [...ordered,...eligible.filter(path=>!seen.has(path))];
}
/** Keep hero first, operational additions visible, and contact/closing at the
 * end unless explicitly included in the reviewed editorial priority. */
export function orderWebsiteHomeSections<T extends WebsiteHomeSectionId>(
  defaults:readonly T[],composition:WebsiteComposition,
):T[]{
  const eligible=new Set<WebsiteHomeSectionId>(defaults);
  const chosen=composition.homeSections.filter(key=>eligible.has(key)) as T[];
  const seen=new Set(chosen);
  const added=defaults.filter(key=>!seen.has(key));
  const closing=new Set<WebsiteHomeSectionId>(["closing","channelsClosing","contact"]);
  const firstClosing=chosen.findIndex(key=>closing.has(key));
  if(firstClosing<0)return [...chosen,...added];
  return [...chosen.slice(0,firstClosing),...added.filter(key=>!closing.has(key)),...chosen.slice(firstClosing),...added.filter(key=>closing.has(key))];
}

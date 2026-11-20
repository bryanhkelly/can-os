import type { SiteLocalContent, SiteLocalTextField } from "./site-local-content";

/**
 * A synthetic Site's administrative name may contain a "Demo" marker.
 * Remove only that marker in private website presentation, never in canonical
 * Site identity, legal claims, or immutable Brand records. The top banner
 * continues to identify the page as a demonstration.
 */
export function previewSyntheticSiteName(name: string, synthetic: boolean): string {
  if(!synthetic)return name;
  const visible=name.replace(/\b(?:demo|demonstration)\b/gi,"")
    .replace(/\s+/g," ").trim();
  return visible.length>=2 ? visible : name;
}

const editorialFields: readonly SiteLocalTextField[] = [
  "heroHeadline","welcomeMessage","localDescription","denomination",
  "statementOfFaith","spiritualFormation","churchHistory",
  "communityOutreach","schoolVision","leadershipWelcome","localTraditions",
];

/** Exact-name substitutions only. Never rewrite unrelated user copy or media. */
export function previewSyntheticSiteContent(
  content: SiteLocalContent,
  displayName: string,
  namesToReplace: readonly string[],
): SiteLocalContent {
  const names=[...new Set(namesToReplace)].filter(name=>
    name.trim().length>=2 && name!==displayName);
  if(!names.length)return content;
  const projected={...content};
  for(const field of editorialFields){
    const text=content[field];
    if(typeof text!=="string")continue;
    projected[field]=names.reduce((value,name)=>
      value.replaceAll(name,displayName),text);
  }
  return projected;
}

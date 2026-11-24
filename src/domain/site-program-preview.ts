import { siteAudienceNames } from "./site-audiences";
import {
  defaultSiteContentChannelConfig, resolveSiteContentBlocks,
  type SiteContentBlockProjection,
} from "./site-content-channels";
import type { SiteLaunchPreferences } from "./site-launch-preferences";

/**
 * Project the operator's saved Program intent into two website surfaces:
 * the homepage and a real Programs page.
 *
 * This is NOT an Offering, adopted Solution, or enrollment authority. Every
 * card derives from the canonical, finite planning-interest vocabulary and
 * has no registration action while its content is still a draft.
 *
 * Reuse any independently authored website-section heading/layout while
 * retaining the source-controlled card titles, labels and safe descriptions.
 */
export function projectPlannedSiteProgramsForPreview(
  preferences: SiteLaunchPreferences | null,
  authoredBlocks: readonly SiteContentBlockProjection[] = [],
): SiteContentBlockProjection[] {
  if (!preferences) return [];
  const [source] = resolveSiteContentBlocks(defaultSiteContentChannelConfig, {
    mode: "private", preferences,
  }).filter(block => block.channel === "learning.interests");
  if (!source || !source.items.length) return [];

  const delivery = preferences.delivery === "both" ? "a combination of in-person and online learning"
    : preferences.delivery === "digital" ? "online learning" : "in-person learning";
  const timingNames:Record<string,string> = {
    weekdays:"weekdays",weekends:"weekends",daytime:"daytime sessions",evenings:"evening sessions",
  };
  const audienceNames = siteAudienceNames;
  const timing = (preferences.timingIds ?? []).map(id=>timingNames[id]??"").filter(Boolean);
  const audiences = (preferences.audienceIds ?? []).map(id=>audienceNames[id]?.toLowerCase()??"").filter(Boolean);
  const description = "We are exploring " + delivery +
    (audiences.length ? " for " + audiences.join(", ") : "") +
    (timing.length ? " with possible " + timing.join(", ") : "") +
    ".";
  const homepage = authoredBlocks.find(block => block.channel === "learning.interests" &&
    (block.page === "/" || block.page === undefined));
  const programsPage = authoredBlocks.find(block => block.channel === "learning.interests" &&
    block.page === "/programs");
  const from = (block: SiteContentBlockProjection | undefined, page: "/" | "/programs",
    id: string): SiteContentBlockProjection => ({
    ...source,
    ...(block ? { eyebrow: block.eyebrow, title: block.title,
      layout: block.layout } : {}),
    description, id, page, placement: "learning", enabled: true,
    // Source-controlled card content; never copy a draft link or claim.
    items: source.items.map(item => ({
      id: item.id, title: item.title, description: item.description,
      label: "Learning interest",
    })),
  });
  return [
    from(homepage, "/", "planned-site-programs-home"),
    from(programsPage ?? homepage, "/programs", "planned-site-programs-page"),
  ];
}

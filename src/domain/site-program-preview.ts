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
 * is deliberately labeled "Proposed · not enrolling".
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

  const homepage = authoredBlocks.find(block => block.channel === "learning.interests" &&
    (block.page === "/" || block.page === undefined));
  const programsPage = authoredBlocks.find(block => block.channel === "learning.interests" &&
    block.page === "/programs");
  const from = (block: SiteContentBlockProjection | undefined, page: "/" | "/programs",
    id: string): SiteContentBlockProjection => ({
    ...source,
    ...(block ? { eyebrow: block.eyebrow, title: block.title,
      description: block.description, layout: block.layout } : {}),
    id, page, placement: "learning", enabled: true,
    // Source-controlled card content; never copy a draft link or claim.
    items: source.items.map(item => ({
      id: item.id, title: item.title, description: item.description,
      label: "Proposed · not enrolling",
    })),
  });
  return [
    from(homepage, "/", "planned-site-programs-home"),
    from(programsPage ?? homepage, "/programs", "planned-site-programs-page"),
  ];
}

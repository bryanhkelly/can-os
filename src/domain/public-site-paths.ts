/** Explicit safe, read-only public paths. Never proxy arbitrary application routes. */
export const publicSitePagePaths = [
  "/", "/about", "/academics", "/student-life", "/school-day", "/admissions", "/tuition", "/families", "/faq", "/contact",
] as const;
export type PublicSitePath = typeof publicSitePagePaths[number];

export function isPublicSitePagePath(path: string): path is PublicSitePath {
  return publicSitePagePaths.some(candidate => candidate === path);
}

/** Static metadata documents are served only from a published, verified tenant origin. */
export const publicSiteMetadataPaths = ["/robots.txt", "/sitemap.xml"] as const;
export type PublicSiteMetadataPath = typeof publicSiteMetadataPaths[number];
/** Only canonical asset UUIDs can be served on tenant origins. Never allow
 * arbitrary bucket paths, private evidence, or application assets. */
export const publicSiteMediaPathPattern=/^\/media\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function isPublicSiteReadPath(path: string): boolean {
  return isPublicSitePagePath(path) ||
    publicSiteMetadataPaths.some(candidate => candidate === path) ||
    publicSiteMediaPathPattern.test(path);
}

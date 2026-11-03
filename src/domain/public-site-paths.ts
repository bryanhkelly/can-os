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
export function isPublicSiteReadPath(path: string): boolean {
  return isPublicSitePagePath(path) ||
    publicSiteMetadataPaths.some(candidate => candidate === path);
}

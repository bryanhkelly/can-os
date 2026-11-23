/** Explicit safe, read-only public paths. Never proxy arbitrary application routes. */
export const publicSitePagePaths = [
  "/", "/about", "/leadership", "/academics", "/student-life", "/school-day", "/admissions", "/tuition", "/families", "/faq", "/contact",
  "/programs", "/experiences", "/courses", "/classes",
] as const;
export type PublicSitePath = typeof publicSitePagePaths[number];

export function isPublicSitePagePath(path: string): path is PublicSitePath {
  return publicSitePagePaths.some(candidate => candidate === path);
}

/** Static metadata documents are served only from a published, verified tenant origin. */
export const publicSiteMetadataPaths = ["/robots.txt", "/sitemap.xml"] as const;
export type PublicSiteMetadataPath = typeof publicSiteMetadataPaths[number];
/** Canonical UUID and reversible 22-character asset references. The server
 * must decode and independently check tenant publication and media approval. */
export const publicSiteMediaPathPattern=/^\\/media\\/(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[A-Za-z0-9_-]{22})$/i;
export function isPublicSiteReadPath(path: string): boolean {
  return isPublicSitePagePath(path) ||
    publicSiteMetadataPaths.some(candidate => candidate === path) ||
    publicSiteMediaPathPattern.test(path);
}

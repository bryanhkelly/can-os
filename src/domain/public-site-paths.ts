/** Explicit safe, read-only public paths. Never proxy arbitrary application routes. */
export const publicSitePagePaths = [
  "/", "/about", "/academics", "/student-life", "/school-day", "/admissions", "/contact",
] as const;
export type PublicSitePath = typeof publicSitePagePaths[number];

export function isPublicSitePagePath(path: string): path is PublicSitePath {
  return publicSitePagePaths.some(candidate => candidate === path);
}

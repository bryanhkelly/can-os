import { safeAccessReturnTo } from "@/domain/access-navigation";

/**
 * The application is private by default. Only explicitly public entry,
 * recruitment, discovery and authentication routes bypass the login gate.
 * Server resources still independently validate their own capabilities.
 */
const publicRoots = new Set([
  "/access", "/landing", "/site/new", "/explore",
  "/interest-event", "/family/interest",
]);

export function isPublicCanPath(pathname: string): boolean {
  const path=pathname.length>1?pathname.replace(/\/+$/,""):pathname;
  if(publicRoots.has(path))return true;
  // These two routes intentionally have public nested pages.
  return path.startsWith("/access/") ||
    path.startsWith("/landing/") || path.startsWith("/explore/");
}

export function signInReturnUrl(value: unknown): string {
  const destination=safeAccessReturnTo(value);
  return destination
    ? "/access?returnTo="+encodeURIComponent(destination)
    : "/access";
}

/** Browser-only caller; keep the exact query and fragment, not a fixed home. */
export function currentPageSignInUrl(location: {
  pathname: string; search: string; hash: string;
}): string {
  return signInReturnUrl(location.pathname+location.search+location.hash);
}

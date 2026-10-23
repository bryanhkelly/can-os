import { PUBLIC_SITE_DOMAIN, slugFromPublicSiteHost } from "./public-site-address";

/** Only these known platform hosts can serve CAN OS, never a partner site. */
const platformHosts = new Set([
  PUBLIC_SITE_DOMAIN,
  ...["www", "app", "api", "auth", "admin", "portal", "dashboard", "static", "cdn", "mail", "docs", "help", "support", "staging", "demo", "test", "internal", "login", "files", "enrichment"]
    .map(label => `${label}.${PUBLIC_SITE_DOMAIN}`),
]);

export type PublicSiteHostDecision =
  | { kind: "platform" }
  | { kind: "deny" }
  | { kind: "site"; slug: string; rewrite: boolean };

/**
 * Source-of-truth edge decision. Do not trust X-Forwarded-Host.
 * Tenant hosts cannot reach SSR workspaces, server functions, admin routes,
 * assets or sign-in endpoints through a different path.
 *
 * The only internal rewrite target is the read-only /published-site server
 * route. It does not load the normal CAN OS root/session shell.
 */
export function classifyPublicSiteRequest(
  requestUrl: string,
  method: string,
  enabled: boolean,
): PublicSiteHostDecision {
  const url = new URL(requestUrl);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (platformHosts.has(host) || !host.endsWith(`.${PUBLIC_SITE_DOMAIN}`)) {
    return { kind: "platform" };
  }
  const slug = slugFromPublicSiteHost(host);
  if (!slug || !enabled || url.protocol !== "https:" || method !== "GET") {
    return { kind: "deny" };
  }
  if (url.pathname === "/" && !url.search && !url.hash) {
    return { kind: "site", slug, rewrite: true };
  }
  // Netlify can re-run matching edge functions when a URL rewrite occurs.
  // This path is not public functionality: it only returns escaped HTML after
  // the server independently validates the Host and publication state.
  if (url.pathname === "/published-site" && !url.search && !url.hash) {
    return { kind: "site", slug, rewrite: false };
  }
  return { kind: "deny" };
}

/** Independently verify the final origin request: never trust a slug in a URL
 * parameter or a client-controlled forwarded header for Site selection. */
export function slugForPublicSiteOrigin(
  request: Request,
  enabled: boolean,
): string | null {
  if (!enabled || request.method !== "GET") return null;
  const url = new URL(request.url);
  if (url.protocol !== "https:" || url.pathname !== "/published-site" ||
      url.search || url.hash) return null;
  const hostHeader = request.headers.get("host");
  if (hostHeader && hostHeader.toLowerCase().replace(/\.$/, "") !== url.host.toLowerCase()) {
    return null;
  }
  return slugFromPublicSiteHost(url.hostname);
}

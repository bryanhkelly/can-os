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
  if (!slug || !enabled || url.protocol !== "https:" || url.search || url.hash) {
    return { kind: "deny" };
  }
  // The ONLY tenant write is a restricted anonymous admissions-interest intake.
  // All other POST, RPC, session, dashboard and asset paths are denied.
  if (method === "POST" && (url.pathname === "/inquiry" || url.pathname === "/apply"))
    return { kind: "site", slug, rewrite: true };
  if (method === "POST" && (url.pathname === "/published-site/inquiry" ||
      url.pathname === "/published-site/family-start"))
    return { kind: "site", slug, rewrite: false };
  if (method === "GET" && url.pathname === "/")
    return { kind: "site", slug, rewrite: true };
  // Netlify may re-run edge middleware on the internal rewrite.
  if (method === "GET" && url.pathname === "/published-site")
    return { kind: "site", slug, rewrite: false };
  return { kind: "deny" };
}

/** Independently verify the final origin request: never trust a slug in a URL
 * parameter or a client-controlled forwarded header for Site selection. */
export function slugForPublicSiteOrigin(
  request: Request,
  enabled: boolean,
): string | null {
  if (!enabled) return null;
  const url = new URL(request.url);
  const routeAllowed =
    (request.method === "GET" && url.pathname === "/published-site") ||
    (request.method === "POST" &&
      (url.pathname === "/published-site/inquiry" || url.pathname === "/published-site/family-start"));
  if (!routeAllowed || url.protocol !== "https:" || url.search || url.hash)
    return null;
  const hostHeader = request.headers.get("host");
  if (hostHeader && hostHeader.toLowerCase().replace(/\.$/, "") !== url.host.toLowerCase()) {
    return null;
  }
  return slugFromPublicSiteHost(url.hostname);
}

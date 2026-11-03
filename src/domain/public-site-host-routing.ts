import { isPublicSiteReadPath } from "./public-site-paths.ts";
import {
  isPublicSiteSlug,
  publicSiteDomain,
  slugFromPublicSiteHost,
} from "./public-site-address.ts";

const platformLabels = [
  "www", "app", "api", "auth", "admin", "portal", "dashboard", "static",
  "cdn", "mail", "docs", "help", "support", "staging", "demo", "test",
  "internal", "login", "files", "enrichment",
];

export type PublicSiteHostDecision =
  | { kind: "platform" }
  | { kind: "deny" }
  | { kind: "site"; slug: string; rewrite: boolean };

function isLocalhost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

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
  configuredDomain?: string,
): PublicSiteHostDecision {
  const url = new URL(requestUrl);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const domain = publicSiteDomain(configuredDomain);
  const platformHosts = new Set([
    domain,
    ...platformLabels.map(label => `${label}.${domain}`),
  ]);
  if (platformHosts.has(host) || !host.endsWith(`.${domain}`)) {
    return { kind: "platform" };
  }
  const slug = slugFromPublicSiteHost(host, domain);
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
  if (method === "GET" && isPublicSiteReadPath(url.pathname))
    return { kind: "site", slug, rewrite: true };
  // Netlify may re-run edge middleware on the internal rewrite.
  if (method === "GET" && (url.pathname === "/published-site" ||
      isRewrittenSitePage(url.pathname)))
    return { kind: "site", slug, rewrite: false };
  return { kind: "deny" };
}

/** Only exact internal page rewrites are recognized, never application routes. */
function isRewrittenSitePage(path: string): boolean {
  return path.startsWith("/published-site/") &&
    path !== "/published-site/" &&
    isPublicSiteReadPath(path.slice("/published-site".length));
}

/** Independently verify the final origin request: never trust a slug in a URL
 * parameter or a client-controlled forwarded header for Site selection. */
export function slugForPublicSiteOrigin(
  request: Request,
  enabled: boolean,
  allowLocalPreview = false,
  configuredDomain?: string,
): string | null {
  if (!enabled && !allowLocalPreview) return null;
  const url = new URL(request.url);
  const hostHeader = request.headers.get("host");
  if (hostHeader && hostHeader.toLowerCase().replace(/\.$/, "") !== url.host.toLowerCase()) {
    return null;
  }
  if (allowLocalPreview && request.method === "GET" &&
      url.pathname === "/published-site" && isLocalhost(url.hostname)) {
    const siteValues = url.searchParams.getAll("site");
    if (siteValues.length !== 1 || url.searchParams.size !== 1) return null;
    const slug = siteValues[0];
    return slug && isPublicSiteSlug(slug) ? slug : null;
  }
  if (!enabled) return null;
  const routeAllowed =
    (request.method === "GET" &&
      (url.pathname === "/published-site" || isRewrittenSitePage(url.pathname))) ||
    (request.method === "POST" &&
      (url.pathname === "/published-site/inquiry" || url.pathname === "/published-site/family-start"));
  if (!routeAllowed || url.protocol !== "https:" || url.search || url.hash)
    return null;
  return slugFromPublicSiteHost(url.hostname, publicSiteDomain(configuredDomain));
}

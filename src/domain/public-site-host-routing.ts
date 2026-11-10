import { isPublicSiteReadPath, isPublicSitePagePath } from "./public-site-paths.ts";
import { isTemplateDefaultImagePath } from "./template-sample-images.ts";
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

// Allow ordinary attribution links to a school's public pages without ever
// selecting a school, enabling a preview, or expanding tenant functionality
// based on a query string. Public forms and assets remain query-free.
const trackingKeys = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "campaign", "ref", "gclid", "fbclid", "msclkid",
]);
function allowedPublishedSiteTracking(url: URL, method: string): boolean {
  if (!url.search) return true;
  if (method !== "GET" || url.search.length > 1024 || url.searchParams.size > 10) return false;
  const page = url.pathname === "/published-site" ? "/" :
    url.pathname.startsWith("/published-site/")
      ? url.pathname.slice("/published-site".length) : url.pathname;
  if (!isPublicSitePagePath(page)) return false;
  const seen = new Set<string>();
  for (const [name, value] of url.searchParams) {
    if (!trackingKeys.has(name) || seen.has(name) ||
        !/^[a-zA-Z0-9_.-]{1,128}$/.test(value)) return false;
    seen.add(name);
  }
  return true;
}

export type PublicSiteHostDecision =
  | { kind: "platform" }
  | { kind: "deny" }
  | { kind: "site"; slug: string; rewrite: boolean };

export function isLocalPreviewHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * Source-of-truth edge decision. Do not trust X-Forwarded-Host.
 * Tenant hosts cannot reach SSR workspaces, server functions, admin routes,
 * application assets or sign-in endpoints through a different path.
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
  if (!slug || !enabled || url.protocol !== "https:" || url.hash ||
      !allowedPublishedSiteTracking(url, method)) {
    return { kind: "deny" };
  }
  if (method === "GET" && isTemplateDefaultImagePath(url.pathname))
    return { kind: "site", slug, rewrite: false };
  // The ONLY tenant write is a restricted anonymous admissions-interest intake.
  // All other POST, RPC, session, dashboard and application asset paths are denied.
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
  allowLocalPreviewWrites = false,
): string | null {
  if (!enabled && !allowLocalPreview) return null;
  const url = new URL(request.url);
  const hostHeader = request.headers.get("host");
  if (hostHeader && hostHeader.toLowerCase().replace(/\.$/, "") !== url.host.toLowerCase()) {
    return null;
  }
  const localRead = request.method === "GET" &&
    (url.pathname === "/published-site" ||
      (url.pathname.startsWith("/published-site/") &&
        isPublicSiteReadPath(url.pathname.slice("/published-site".length))));
  const localWrite = allowLocalPreviewWrites && request.method === "POST" &&
    ["/published-site/inquiry", "/published-site/family-start"].includes(url.pathname);
  if (allowLocalPreview && url.protocol === "http:" && (localRead || localWrite) &&
      isLocalPreviewHost(url.hostname)) {
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
  if (!routeAllowed || url.protocol !== "https:" || url.hash ||
      !allowedPublishedSiteTracking(url, request.method))
    return null;
  return slugFromPublicSiteHost(url.hostname, publicSiteDomain(configuredDomain));
}

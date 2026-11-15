import { isPublicSitePagePath, type PublicSitePath } from "./public-site-paths";
import { escapePublicHtml } from "./public-site-html";

/** This address is an authenticated workspace read, NOT public publication. */
export const privateWebsitePreviewPath = "/website-preview";

export function privateWebsitePreviewUrl(siteId: string, page: PublicSitePath = "/"): string {
  return `${privateWebsitePreviewPath}?siteId=${encodeURIComponent(siteId)}&page=${encodeURIComponent(page)}`;
}

const siteUuid = /^[\da-f]{8}-[\da-f]{4}-[1-8\da-f]{4}-[89ab\da-f]{4}-[\da-f]{12}$/i;

export function parsePrivateWebsitePreviewRequest(requestUrl: string):
  | { siteId: string; page: PublicSitePath }
  | null {
  const params = new URL(requestUrl).searchParams;
  if ([...params.keys()].some(key => key !== "siteId" && key !== "page") ||
      params.getAll("siteId").length !== 1 || params.getAll("page").length > 1) return null;
  const siteId = params.get("siteId") ?? "";
  const page = params.get("page") ?? "/";
  if (!siteUuid.test(siteId) || !isPublicSitePagePath(page)) return null;
  return { siteId, page };
}

/** Converts only canonical, available school pages into authenticated
 * same-Site links. Hash anchors remain local; no client JS or forms are added. */
export function renderPrivateWebsitePreviewHtml(
  html: string,
  siteId: string,
  availablePages: readonly string[],
  saved = true,
  kind: "site" | "school" = "school",
): string {
  const links = new Set(availablePages.filter(isPublicSitePagePath));
  const converted = html.replace(/href="(\/[a-z-]*)"/g, (_match, path: string) =>
    isPublicSitePagePath(path) && links.has(path)
      ? `href="${privateWebsitePreviewUrl(siteId, path)}"` : 'aria-disabled="true"');
  const editor = `/launch/website?siteId=${encodeURIComponent(siteId)}&returnToHub=true&step=preview`;
  const banner = `<aside class="can-private-preview" role="status">
  <strong>Private ${kind === "site" ? "Site" : "school"} website preview</strong>
  <span>${saved ? "Saved design" : kind === "site" ? "Unsaved Site starter · illustrative only" : "Unsaved school starter · illustrative only"} · not published · sign-in required</span>
  <a href="${editor}">Return to Website &amp; Brand Studio</a>
  </aside>`;
  const style = `<style>
  .can-private-preview{position:relative;z-index:99;display:flex;align-items:center;justify-content:center;
  gap:18px;flex-wrap:wrap;background:#112d34;color:#fff;padding:13px 22px;font:600 13px/1.6 Arial,sans-serif}
  .can-private-preview span{color:#d8e8e9;font-weight:400}
  .can-private-preview a{color:#fff;text-decoration:underline;text-underline-offset:4px}
  @media(max-width:700px){.can-private-preview{flex-direction:column;align-items:flex-start;gap:3px}}
  </style>`;
  // The source HTML is produced by the canonical safe, escaped Site renderer;
  // the only inserted strings are escaped Site text and a validated UUID.
  return converted.replace("</head>", `${style}</head>`)
    .replace(/(<body\b[^>]*>)/, `$1${banner}`)
    .replace("</title>", ` · Private preview</title>`);
}

export const privateWebsitePreviewHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data: https://*.can-os.com; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
} as const;

/** Escape a school title in diagnostic content without reflecting URL input. */
export function privateWebsitePreviewErrorPage(title: string, message: string): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapePublicHtml(title)}</title><body style="font:16px/1.6 system-ui;padding:32px">
  <h1>${escapePublicHtml(title)}</h1><p>${escapePublicHtml(message)}</p></body></html>`;
}

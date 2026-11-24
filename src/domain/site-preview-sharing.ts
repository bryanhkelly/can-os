import type { SiteContentBlockProjection } from "./site-content-channels";
import { type PublicSitePage } from "./public-site-html";
import { siteLocalImagePublicationGaps, type SiteLocalContent } from "./site-local-content";
import { isPublicSitePagePath } from "./public-site-paths";

/** Unlisted, immutable snapshot navigation: never allow submissions or
 * navigations into operational/public enrollment workflows.
 */
export function renderSharedSitePreview(
  storedHtml: string, goCode: string,
  availablePages: readonly string[],
): string {
  if (!/^[A-Za-z0-9_-]{12}$/.test(goCode)) throw new Error("Invalid Go code");
  const known = new Set(availablePages.filter(isPublicSitePagePath));
  const rewritten = storedHtml.replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, "")
    .replace(/(<a\b[^>]*?)href="([^"]*)"/g, (_full, prefix: string, target: string) => {
      if (target.startsWith("#")) return `${prefix}href="${target}"`;
      if (!isPublicSitePagePath(target) || !known.has(target))
        return `${prefix}href="#" aria-disabled="true" tabindex="-1"`;
      return `${prefix}href="/go/${goCode}?${new URLSearchParams({page:target}).toString()}"`;
    });
  const banner = `<aside class="can-share-preview" role="status">
    <strong>Proposed learning community · Website preview</strong>
    <span>Not published or independently approved. Images may be illustrative. Forms are disabled. No accreditation or enrollment is implied.</span>
  </aside>`;
  const style = `<style>
  .can-share-preview{z-index:99;position:relative;display:flex;flex-wrap:wrap;align-items:center;
    justify-content:center;gap:8px 18px;padding:11px 18px;background:#173d43;color:#fff;
    font:500 13px/1.5 system-ui,sans-serif}
  .can-share-preview strong{font-weight:700}
  .can-share-preview span{color:#e1eeef}
  @media(max-width:600px){.can-share-preview{align-items:flex-start;flex-direction:column}}
  </style>`;
  return rewritten.replace("</head>", `<meta name="robots" content="noindex,nofollow">${style}</head>`)
    .replace(/(<body\b[^>]*>)/, `$1${banner}`)
    .replace("</title>", ` · Proposed website preview</title>`);
}

/**
 * A frozen external preview is a minimal projection of the canonical website
 * renderer, not an export of Site metadata. It cannot include Site Story,
 * contact directories, unapproved media, academic claims or enrollment URLs.
 */
export function projectShareableSitePreview(input: {
  siteName: string;
  organizationName: string;
  content: SiteLocalContent;
  plannedPrograms?: readonly SiteContentBlockProjection[];
}): PublicSitePage {
  const { editorialBaseline: _privateOriginalCopy, ...copy } = input.content;
  return {
    host: "preview.can-os.com",
    site: { name: input.siteName, organizationName: input.organizationName },
    localContent: {
      ...copy,
      branding: {
        ...copy.branding,
        heroImage: siteLocalImagePublicationGaps(copy.branding.heroImage).length
          ? null : copy.branding.heroImage,
        logoImage: siteLocalImagePublicationGaps(copy.branding.logoImage ?? null).length
          ? null : copy.branding.logoImage ?? null,
      },
    },
    offerings: [],
    academicPrograms: [],
    noncreditReleases: [],
    enrollmentOpportunities: [],
    // The Site's intended Programs are visible, clearly proposed, and have
    // no links, application actions, or adopted Solution claims.
    contentBlocks: (input.plannedPrograms ?? []).filter(block =>
      block.channel === "learning.interests" && block.items.every(item => !item.link)),
    media: {},
  };
}

export const sitePreviewShareHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' data: https://*.can-os.com; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'none'",
} as const;


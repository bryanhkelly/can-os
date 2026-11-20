import type { SiteContentBlockProjection } from "./site-content-channels";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { escapePublicHtml, type PublicSitePage } from "./public-site-html";
import { siteLocalImagePublicationGaps, type SiteLocalContent } from "./site-local-content";
import { isPublicSitePagePath } from "./public-site-paths";

const uuid = z.string().uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const iso = z.string().datetime({ offset: true });
const snapshotPages = z.record(z.string(), z.string().max(1_500_000))
  .refine(pages => Object.keys(pages).length > 0
    && Object.keys(pages).length <= 14
    && Object.keys(pages).every(isPublicSitePagePath)
    && typeof pages["/"] === "string", "Valid website preview pages are required");

export const sitePreviewShareSchema = z.object({
  id: uuid,
  tokenDigest: digest,
  createdAt: iso,
  expiresAt: iso.nullable(),
  revokedAt: iso.nullable(),
  sourceRevision: z.number().int().nonnegative(),
  brandVersionId:z.string().uuid().optional(),
  synthetic:z.boolean().optional(),
  pages: snapshotPages,
}).strict();
export type SitePreviewShare = z.infer<typeof sitePreviewShareSchema>;

export const sitePreviewShareListSchema = z.array(sitePreviewShareSchema).max(12);

export function readSitePreviewShares(metadata: Record<string, unknown>): SitePreviewShare[] {
  const value = metadata.websitePreviewSharesV1;
  return value === undefined ? [] : sitePreviewShareListSchema.parse(value);
}

export function createPreviewShareToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenDigest: hashPreviewShareToken(token) };
}

export function hashPreviewShareToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Only 256-bit random bearer tokens are accepted. Never log the raw token. */
export function validPreviewShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function activePreviewShare(
  shares: readonly SitePreviewShare[], token: string, at: Date,
): SitePreviewShare | null {
  if (!validPreviewShareToken(token)) return null;
  const requested = Buffer.from(hashPreviewShareToken(token), "hex");
  for (const share of shares) {
    const stored = Buffer.from(share.tokenDigest, "hex");
    if (!timingSafeEqual(requested, stored)) continue;
    if (share.revokedAt || (share.expiresAt && Date.parse(share.expiresAt) <= at.getTime())) return null;
    return share;
  }
  return null;
}

/** Unlisted, immutable snapshot navigation: never allow submissions or
 * navigations into operational/public enrollment workflows.
 */
export function renderSharedSitePreview(
  storedHtml: string, siteId: string, token: string,
  availablePages: readonly string[],
  synthetic = false,
): string {
  const known = new Set(availablePages.filter(isPublicSitePagePath));
  const rewritten = storedHtml.replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, "")
    .replace(/(<a\b[^>]*?)href="([^"]*)"/g, (_full, prefix: string, target: string) => {
      if (target.startsWith("#")) return `${prefix}href="${target}"`;
      if (!isPublicSitePagePath(target) || !known.has(target))
        return `${prefix}href="#" aria-disabled="true" tabindex="-1"`;
      const params = new URLSearchParams({ siteId, token, page: target });
      return `${prefix}href="/site-preview-share?${params.toString().replaceAll("&", "&amp;")}"`;
    });
  const banner = `<aside class="can-share-preview" role="status">
    <strong>${synthetic ? "Demonstration website preview" : "Proposed learning community · Website preview"}</strong>
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

export function previewShareUnavailable(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Website preview unavailable</title></head>
  <body style="font:16px/1.6 system-ui;padding:32px">
  <h1>Website preview unavailable</h1>
  <p>${escapePublicHtml("This link is invalid, expired, or has been revoked. Ask the Site organizer for a new preview.")}</p>
  </body></html>`;
}

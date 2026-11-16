/** Authenticated Site-first preview headers only. Presentation is composed by the Site renderer. */
export const siteFirstPreviewHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data: https://*.can-os.com; base-uri 'none'; frame-ancestors 'self'; form-action 'none'",
} as const;

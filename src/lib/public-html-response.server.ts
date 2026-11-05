import { escapePublicHtml } from "@/domain/public-site-html";
import { isLocalPreviewHost } from "@/domain/public-site-host-routing";

const securityHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

export function publicHtmlResponse(body: string, options: {
  title: string;
  maxWidth: string;
  status?: number;
}) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapePublicHtml(options.title)}</title></head>
    <body style="font-family:system-ui;max-width:${options.maxWidth};margin:3rem auto;padding:1rem;line-height:1.5">
    ${body}</body></html>`, {
    status: options.status ?? 200,
    headers: { ...securityHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}

export function hasConfiguredPublicOrigin(request: Request, options?: { localPreviewPath?: string }) {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (host && host.toLowerCase().replace(/\.$/, "") !== url.host.toLowerCase()) return false;
  if (options?.localPreviewPath && process.env.CAN_PUBLIC_SITE_LOCAL_PREVIEW_WRITES_ENABLED === "true" &&
      url.protocol === "http:" && url.pathname === options.localPreviewPath && isLocalPreviewHost(url.hostname)) return true;
  const configured = process.env.CAN_ACCESS_PUBLIC_ORIGIN;
  if (!configured) return false;
  try {
    const destination = new URL(configured);
    return destination.protocol === "https:" && destination.pathname === "/" &&
      !destination.search && !destination.hash && url.origin === destination.origin;
  } catch { return false; }
}
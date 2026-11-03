import { createFileRoute } from "@tanstack/react-router";
import { slugForPublicSiteOrigin } from "@/domain/public-site-host-routing";
import { isPublicSitePagePath, isPublicSiteReadPath } from "@/domain/public-site-paths";
import { availablePublicSitePaths, isIndexablePublicSite, renderPublicSiteHtml } from "@/domain/public-site-html";

const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  "Vary": "Host",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "index, follow",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

const unavailable = (status: number) => new Response(
  status === 404 ? "Not found" : "Site temporarily unavailable", {
    status, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow" },
  },
);

/** Tenant pages have a separate server-only path; no authenticated CAN app shell. */
export const Route = createFileRoute("/published-site/$page")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const slug = slugForPublicSiteOrigin(
          request, process.env.CAN_PUBLIC_SITE_HOSTING_ENABLED === "true",
        );
        if (!slug) return unavailable(404);
        const internalPath = new URL(request.url).pathname;
        const path = internalPath.slice("/published-site".length);
        if (!isPublicSiteReadPath(path) || path === "/") return unavailable(404);
        try {
          const { readPublishedSiteCatalog } = await import("@/modules/sites/site-public-catalog.server");
          const catalog = await readPublishedSiteCatalog(slug);
          if (!catalog) return unavailable(404);
          const indexable = isIndexablePublicSite(catalog);
          if (path === "/robots.txt") return new Response(
            indexable
              ? `User-agent: *\nAllow: /\nSitemap: https://${catalog.host}/sitemap.xml\n`
              : "User-agent: *\nDisallow: /\n", {
              status: 200, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8",
                "X-Robots-Tag": indexable ? "index, follow" : "noindex, nofollow" },
            });
          // Synthetic schools are deliberately absent from search discovery.
          if (path === "/sitemap.xml" && !indexable) return unavailable(404);
          if (path === "/sitemap.xml") {
            const urls = availablePublicSitePaths(catalog).map(pagePath =>
              `<url><loc>https://${catalog.host}${pagePath}</loc></url>`).join("");
            return new Response(`<?xml version="1.0" encoding="UTF-8"?>` +
              `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
                status: 200, headers: { ...headers, "Content-Type": "application/xml; charset=utf-8" },
              });
          }
          if (!isPublicSitePagePath(path) || !availablePublicSitePaths(catalog).includes(path)) return unavailable(404);
          return new Response(renderPublicSiteHtml(catalog, {
            path, makeRequestId: () => crypto.randomUUID(),
          }), { status: 200, headers: indexable ? headers :
            { ...headers, "X-Robots-Tag": "noindex, nofollow" } });
        } catch {
          return unavailable(503);
        }
      },
    },
  },
});

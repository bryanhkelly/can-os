import { createFileRoute } from "@tanstack/react-router";
import { slugForPublicSiteOrigin } from "@/domain/public-site-host-routing";
import { isPublicSitePagePath } from "@/domain/public-site-paths";
import { availablePublicSitePaths, renderPublicSiteHtml } from "@/domain/public-site-html";

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
        if (!isPublicSitePagePath(path) || path === "/") return unavailable(404);
        try {
          const { readPublishedSiteCatalog } = await import("@/modules/sites/site-public-catalog.server");
          const catalog = await readPublishedSiteCatalog(slug);
          if (!catalog || !availablePublicSitePaths(catalog).includes(path)) return unavailable(404);
          return new Response(renderPublicSiteHtml(catalog, {
            path, makeRequestId: () => crypto.randomUUID(),
          }), { status: 200, headers });
        } catch {
          return unavailable(503);
        }
      },
    },
  },
});

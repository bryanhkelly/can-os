import { createFileRoute } from "@tanstack/react-router";
import { slugForPublicSiteOrigin } from "@/domain/public-site-host-routing";
import { renderPublicSiteHtml } from "@/domain/public-site-html";

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

/**
 * Standalone server-only HTML endpoint for a verified tenant Host.
 * This never loads the client router's workspace session or sign-in state.
 * The Netlify hostname gate must be enabled separately and deny all other
 * paths at tenant origins before routing to this handler.
 */
export const Route = createFileRoute("/published-site")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const slug = slugForPublicSiteOrigin(
          request, process.env.CAN_PUBLIC_SITE_HOSTING_ENABLED === "true",
        );
        if (!slug) return new Response("Not found", {
          status: 404, headers: { ...headers, "X-Robots-Tag": "noindex, nofollow", "Content-Type": "text/plain; charset=utf-8" },
        });
        try {
          const { readPublishedSiteCatalog } = await import("@/modules/sites/site-public-catalog.server");
          const catalog = await readPublishedSiteCatalog(slug);
          if (!catalog) return new Response("Not found", {
            status: 404, headers: { ...headers, "X-Robots-Tag": "noindex, nofollow", "Content-Type": "text/plain; charset=utf-8" },
          });
          return new Response(renderPublicSiteHtml(catalog, { makeRequestId: () => crypto.randomUUID() }), { status: 200, headers });
        } catch {
          // Fail closed on a missing migration, database error or unexpected data.
          return new Response("Site temporarily unavailable", {
            status: 503, headers: { ...headers, "X-Robots-Tag": "noindex, nofollow", "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      },
    },
  },
});

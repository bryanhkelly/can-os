import { createFileRoute } from "@tanstack/react-router";
import { resolveSiteGoLink } from "@/modules/engagement/site-go-links.server";

const headers = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};
const unavailable = (status: number) => new Response(
  status === 404 ? "This link is unavailable or has expired." : "This link is temporarily unavailable.", {
    status, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
  },
);

/** GET only, finite destinations, and non-cacheable 302 so revocation takes effect. */
export const Route = createFileRoute("/go/$code")({
  server: { handlers: {
    GET: async ({ params }) => {
      try {
        const destination = await resolveSiteGoLink(params.code);
        if (!destination) return unavailable(404);
        return new Response(null, { status: 302, headers: { ...headers, Location: destination } });
      } catch (error) {
        console.error("Go link resolution unavailable", { kind: "unavailable" });
        return unavailable(503);
      }
    },
  } },
});

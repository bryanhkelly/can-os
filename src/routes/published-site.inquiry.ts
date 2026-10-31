import { createFileRoute } from "@tanstack/react-router";
import { slugForPublicSiteOrigin } from "@/domain/public-site-host-routing";
import {
  readSmallUrlEncodedBody, parsePublicAdmissionsInterest,
} from "@/domain/public-admissions-interest";

const commonHeaders = {
  "Cache-Control": "private, no-store",
  "Vary": "Host",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};

/** A standalone tenant-origin POST; no CAN OS session or application. */
export const Route = createFileRoute("/published-site/inquiry")({
  server: { handlers: {
    POST: async ({ request }) => {
      const slug = slugForPublicSiteOrigin(
        request, process.env.CAN_PUBLIC_SITE_HOSTING_ENABLED === "true",
      );
      const origin = new URL(request.url).origin;
      if (!slug || request.headers.get("origin") !== origin) {
        return new Response("Not found", {
          status: 404,
          headers: { ...commonHeaders, "Content-Type": "text/plain; charset=utf-8" },
        });
      }

      // Verified published-Site and global emergency limits apply before parsing submitted data.
      try {
        const { admitPublicAdmissionsInterest } =
          await import("@/modules/enrollment/public-admissions-interest.server");
        const budget = await admitPublicAdmissionsInterest("public_site_inquiry", slug);
        if (!budget.allowed) return new Response("Too many requests. Try again later.", {
          status: 429, headers: { ...commonHeaders,
            "Content-Type": "text/plain; charset=utf-8",
            "Retry-After": String(budget.retryAfterSeconds) },
        });
      } catch {
        return new Response("Information requests are temporarily unavailable.", {
          status: 503, headers: { ...commonHeaders,
            "Content-Type": "text/plain; charset=utf-8",
            "Retry-After": "30" },
        });
      }

      let data;
      try {
        data = parsePublicAdmissionsInterest(await readSmallUrlEncodedBody(request));
      } catch {
        return new Response("Please review the information in your request and try again.", {
          status: 400, headers: { ...commonHeaders,
            "Content-Type": "text/plain; charset=utf-8" },
        });
      }

      try {
        const { recordPublicAdmissionsInterest } =
          await import("@/modules/enrollment/public-admissions-interest.server");
        await recordPublicAdmissionsInterest(slug, data);
        // Do not reflect the provided contact details or reveal duplicate status.
        return new Response(`<!doctype html><html lang="en"><head>
          <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
          <meta name="robots" content="noindex,nofollow"><title>Information request received</title>
          </head><body style="font-family:system-ui,sans-serif;max-width:42rem;margin:4rem auto;padding:1rem">
          <h1>Thank you for your interest.</h1>
          <p>Your request has been received for review. This is not an application or an enrollment confirmation.</p>
          <p><a href="/">Return to programs</a></p>
          </body></html>`, {
          status: 200, headers: { ...commonHeaders,
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
          },
        });
      } catch {
        // Do not disclose whether a Program/Person exists or why a write failed.
        return new Response("This request could not be received right now.", {
          status: 503, headers: { ...commonHeaders,
            "Content-Type": "text/plain; charset=utf-8",
            "Retry-After": "30" },
        });
      }
    },
  } },
});

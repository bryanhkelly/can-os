import handler from "@tanstack/react-start/server-entry";
import { withRequestDatabase } from "./db/client";
import { classifyPublicSiteRequest } from "./domain/public-site-host-routing";
import { publicSiteDomain } from "./domain/public-site-address";

interface RateLimiter {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

interface DemoEnvironment {
  ACCESS_REQUEST_LIMIT: RateLimiter;
  ACCESS_VERIFY_LIMIT: RateLimiter;
  CAN_PUBLIC_SITE_DOMAIN?: string;
  DATABASE_URL?: string;
}

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.r2.cloudflarestorage.com; media-src 'self' https:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

export default {
  async fetch(request: Request, env: DemoEnvironment): Promise<Response> {
    const url = new URL(request.url);
    const host = request.headers.get("host");
    const decision = classifyPublicSiteRequest(
      request.url, request.method, false, publicSiteDomain(env.CAN_PUBLIC_SITE_DOMAIN),
    );
    if ((host && host.toLowerCase() !== url.host.toLowerCase()) || decision.kind !== "platform") {
      return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    if (request.method === "POST") {
      const limiters: Record<string, RateLimiter> = {
        "/access/request": env.ACCESS_REQUEST_LIMIT,
        "/access/verify": env.ACCESS_VERIFY_LIMIT,
      };
      if (Object.hasOwn(limiters, url.pathname)) {
        const key = `${url.hostname}:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`;
        const result = await limiters[url.pathname]!.limit({ key });
        if (!result.success) {
          return new Response("Too many requests", {
            status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" },
          });
        }
      }
    }

    // Workerd disallows WebSocket I/O from a pool created in a different
    // request. This encompasses SSR, server functions, and their queries.
    const response = await withRequestDatabase(
      () => handler.fetch(request),
      env.DATABASE_URL ?? process.env.DATABASE_URL,
    );
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(securityHeaders)) {
      if (!headers.has(name)) headers.set(name, value);
    }
    return new Response(response.body, {
      status: response.status, statusText: response.statusText, headers,
    });
  },
};

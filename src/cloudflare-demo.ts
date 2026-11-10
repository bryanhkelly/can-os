import handler from "@tanstack/react-start/server-entry";
import type {PhotoWorkerEnv} from "./platform/photography/cloudflare-production.server";
import { withRequestDatabase } from "./db/client";
import { classifyPublicSiteRequest } from "./domain/public-site-host-routing";
import { publicSiteDomain } from "./domain/public-site-address";

interface RateLimiter {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

interface DemoEnvironment extends PhotoWorkerEnv {
  ACCESS_REQUEST_LIMIT: RateLimiter;
  ACCESS_VERIFY_LIMIT: RateLimiter;
  CAN_PUBLIC_SITE_DOMAIN?: string;
  CAN_PUBLIC_SITE_HOSTING_ENABLED?: string;
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
  scheduled(_event: unknown,env:DemoEnvironment,ctx:{waitUntil(task:Promise<unknown>):void}) {
    ctx.waitUntil(import("./platform/photography/cloudflare-production.server")
      .then(({runBoundTemplatePhotoProduction})=>runBoundTemplatePhotoProduction(env))
      .then(result=>console.info("CAN template photography tick",result))
      .catch(error=>console.error("CAN template photography tick failed",{
        errorType:error instanceof Error?error.name:"unknown",
        message:error instanceof Error?error.message.slice(0,140):"unknown",
      })));
  },
  async fetch(request: Request, env: DemoEnvironment): Promise<Response> {
    const url = new URL(request.url);
    const host = request.headers.get("host");
    // Host-based tenant routing is enabled only after wildcard DNS/TLS and
    // the Cloudflare route have been separately provisioned. Never expose an
    // application route or select a Site from a query string on tenant hosts.
    const decision = classifyPublicSiteRequest(
      request.url, request.method, env.CAN_PUBLIC_SITE_HOSTING_ENABLED === "true",
      publicSiteDomain(env.CAN_PUBLIC_SITE_DOMAIN),
    );
    if ((host && host.toLowerCase() !== url.host.toLowerCase()) || decision.kind === "deny") {
      return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    let routedRequest = request;
    if (decision.kind === "site" && decision.rewrite) {
      const target = new URL(request.url);
      if (request.method === "POST") {
        target.pathname = url.pathname === "/apply"
          ? "/published-site/family-start" : "/published-site/inquiry";
      } else {
        target.pathname = url.pathname === "/"
          ? "/published-site" : "/published-site" + url.pathname;
      }
      routedRequest = new Request(target, request);
    }

    // Direct R2 bindings avoid S3 signed requests for production template
    // photography. Only exact, read-only public sample routes are intercepted.
    if(url.pathname==="/template-photo-status"){
      const {readBoundTemplatePhotoStatus}=await import("./platform/photography/cloudflare-production.server");
      return readBoundTemplatePhotoStatus(request,env);
    }
    if(url.pathname.startsWith("/template-photo/")){
      const {readBoundTemplatePhoto}=await import("./platform/photography/cloudflare-production.server");
      return readBoundTemplatePhoto(request,env);
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
      async () => await handler.fetch(routedRequest),
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

import { classifyPublicSiteRequest } from "../../src/domain/public-site-host-routing.ts";

// Netlify supplies the environment at the edge, independently of Vite build
// variables. The rollout flag is deliberately OFF unless explicitly enabled.
declare const Netlify: { env: { get(name: string): string | undefined } };

/**
 * Fail-closed network boundary for public tenant origins.
 * The main CAN OS app on Netlify/application hosts is untouched.
 *
 * IMPORTANT: Wildcard DNS/TLS is not provisioned by this source change.
 * Tenant-origin requests cannot reach CAN OS private routes or RPCs.\n * POST /apply is only a verification-link request, never a child write.
 */
export default function siteHostGate(request: Request): Response | URL | undefined {
  const enabled = typeof Netlify !== "undefined" &&
    Netlify.env.get("CAN_PUBLIC_SITE_HOSTING_ENABLED") === "true";
  let decision;
  try {
    decision = classifyPublicSiteRequest(request.url, request.method, enabled);
  } catch {
    return new Response("Not found", {
      status: 404, headers: { "Cache-Control": "no-store" },
    });
  }
  if (decision.kind === "platform") return undefined;
  if (decision.kind === "deny") return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
  if (decision.rewrite) {
    const target=request.method!=="POST"?"/published-site":
      new URL(request.url).pathname==="/apply"
        ?"/published-site/family-start":"/published-site/inquiry";
    return new URL(target,request.url);
  }
  // Netlify can invoke the edge function again for the internal rewrite.
  // The origin re-checks exact Host and publication before any content read.
  return undefined;
}

export const config = { path: "/*", onError: "fail" };

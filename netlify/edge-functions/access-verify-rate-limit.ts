/**
 * Netlify's trusted edge enforces per-client limits before CAN OS server
 * handlers run. The built-in counter uses Netlify-resolved client IP and
 * hostname; the app never trusts forwarded headers supplied by a caller.
 *
 * Access-link and demo-code verification: 40 requests / minute / IP + domain.
 *
 * Returning undefined deliberately preserves the original POST request and
 * leaves credential parsing, the global database ceiling and all application
 * authorization to the downstream TanStack Start handler.
 *
 * Netlify applies rate rules during deploy post-processing. Confirm the
 * deployed rule in the Netlify deployment logs before production use.
 */
export default function authRateLimitPassThrough() {
  return;
}

export const config = {
  path: "/access/verify",
  method: "POST",
  rateLimit: {
    windowLimit: 40,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};

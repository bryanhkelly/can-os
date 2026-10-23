/** Canonical CAN OS public subdomain labels; never derive authorization from a Host header. */
export const PUBLIC_SITE_DOMAIN = "can-os.com";
const labelPattern = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;
const reserved = new Set([
  "admin", "api", "app", "auth", "cdn", "dashboard", "demo",
  "docs", "enrichment", "files", "help", "internal", "login",
  "mail", "portal", "staging", "static", "support", "test", "www",
]);

export function isPublicSiteSlug(value: string): boolean {
  return value.length >= 3 && value.length <= 48 &&
    labelPattern.test(value) && !value.includes("--") && !reserved.has(value);
}

/** Reject, rather than silently correcting, malformed or reserved public addresses. */
export function requirePublicSiteSlug(value: string): string {
  if (!isPublicSiteSlug(value)) {
    throw new Error("Use 3–48 lowercase letters, digits or single hyphens; this address may be reserved.");
  }
  return value;
}

export function publicSiteHost(slug: string): string {
  return `${requirePublicSiteSlug(slug)}.${PUBLIC_SITE_DOMAIN}`;
}

/** Only an exact, one-label CAN OS public hostname is eligible for tenant lookup. */
export function slugFromPublicSiteHost(host: string): string | null {
  const normalized = host.toLowerCase().replace(/\.$/, "");
  const suffix = `.${PUBLIC_SITE_DOMAIN}`;
  if (!normalized.endsWith(suffix)) return null;
  const slug = normalized.slice(0, -suffix.length);
  return isPublicSiteSlug(slug) ? slug : null;
}

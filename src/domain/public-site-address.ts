/** Default CAN OS public domain; deployments may set CAN_PUBLIC_SITE_DOMAIN. */
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

export function publicSiteDomain(configured?: string): string {
  const environmentDomain = configured ??
    (typeof process === "undefined" ? undefined : process.env.CAN_PUBLIC_SITE_DOMAIN);
  const domain = environmentDomain?.trim().toLowerCase() || PUBLIC_SITE_DOMAIN;
  const labels = domain.split(".");
  if (labels.length < 2 || domain.length > 253 ||
      labels.some(label => label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) ||
      !/^[a-z]{2,63}$/.test(labels.at(-1) ?? "")) {
    throw new Error("CAN_PUBLIC_SITE_DOMAIN must be a DNS domain without a scheme, port, or wildcard.");
  }
  return domain;
}

/** Reject, rather than silently correcting, malformed or reserved public addresses. */
export function requirePublicSiteSlug(value: string): string {
  if (!isPublicSiteSlug(value)) {
    throw new Error("Use 3–48 lowercase letters, digits or single hyphens; this address may be reserved.");
  }
  return value;
}

export function publicSiteHost(slug: string, domain = publicSiteDomain()): string {
  return `${requirePublicSiteSlug(slug)}.${publicSiteDomain(domain)}`;
}

/** Only an exact, one-label public hostname is eligible for tenant lookup. */
export function slugFromPublicSiteHost(host: string, domain = publicSiteDomain()): string | null {
  const normalized = host.toLowerCase().replace(/\.$/, "");
  const suffix = `.${publicSiteDomain(domain)}`;
  if (!normalized.endsWith(suffix)) return null;
  const slug = normalized.slice(0, -suffix.length);
  return isPublicSiteSlug(slug) ? slug : null;
}

/**
 * Draft-only address suggestions for a newly created canonical Site.
 * Prefer the human-readable Site slug; if another Site already reserved it,
 * use a deterministic suffix from THIS Site's UUID. Never publish here.
 * Database uniqueness remains the final arbiter of concurrent reservations.
 */
export function suggestedSitePublicSlugs(siteSlug: string, siteId: string): readonly string[] {
  const suffix = siteId.replace(/-/g, "").slice(0, 12).toLowerCase();
  if (!/^[0-9a-f]{12}$/.test(suffix)) {
    throw new Error("A canonical Site ID is required for public address provisioning");
  }
  const normalized = siteSlug.toLowerCase().replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-").replace(/^-|-$/g, "");
  const base = normalized.slice(0, 48).replace(/-+$/g, "");
  const withSuffix = (value: string) => {
    const stem = value.slice(0, 48 - suffix.length - 1).replace(/-+$/g, "");
    return `${stem || "site"}-${suffix}`;
  };
  const preferred = isPublicSiteSlug(base) ? base : withSuffix(normalized);
  const fallback = withSuffix(normalized);
  return preferred === fallback ? [fallback] : [preferred, fallback];
}

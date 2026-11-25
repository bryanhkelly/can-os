/** Normalized DNS-style identity domains. Classification is never authority. */
export function normalizeIdentityDomain(value: string | null | undefined): string | null {
  const domain=value?.trim().toLowerCase();
  if (!domain || domain.length>253 || !domain.includes(".")) return null;
  if (!domain.split(".").every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  return domain;
}

export function identityEmailDomain(email: string | null | undefined): string | null {
  const parts=email?.trim().split("@");
  if (!parts || parts.length!==2 || !parts[0] || /\s/.test(parts[0])) return null;
  return normalizeIdentityDomain(parts[1]);
}

export function isDemoDomain(domain: string | null | undefined): boolean {
  return normalizeIdentityDomain(domain)?.endsWith(".demo") ?? false;
}

/** Unknown domains are not evidence that an Organization's data is real.
 * Classify the owner, never the learner, author, credential or publisher
 * of content consumed by that owner. This is not a permission check. */
export function classifyOwnedData(ownerDomain: string | null | undefined): "synthetic" | "real" | "unknown" {
  const domain = normalizeIdentityDomain(ownerDomain);
  return domain === null ? "unknown" : isDemoDomain(domain) ? "synthetic" : "real";
}

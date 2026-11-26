/** Normalized DNS-style identity domains. Classification is never authority. */
export function normalizeIdentityDomain(value: string | null | undefined): string | null {
  const domain=value?.trim().toLowerCase();
  if (!domain || domain.length>253 || !domain.includes(".")) return null;
  if (!domain.split(".").every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  return domain;
}

export function identityEmailDomain(email: string | null | undefined): string | null {
  const parts=email?.trim().split("@");
  if (!parts || parts.length!==2 || !parts[0] || parts.some(part=>/\s/.test(part))) return null;
  return normalizeIdentityDomain(parts[1]);
}

export function isDemoDomain(domain: string | null | undefined): boolean {
  return normalizeIdentityDomain(domain)?.endsWith(".demo") ?? false;
}

/** Email classification is not proof of mailbox ownership or authority. */
export function isDemoAccountEmail(email: string): boolean {
  return isDemoDomain(identityEmailDomain(email));
}

/** Unknown domains are not evidence that an Organization's data is real.
 * Classify the owner, never the learner, author, credential or publisher
 * of content consumed by that owner. This is not a permission check. */
export function classifyOwnedData(ownerDomain: string | null | undefined): "synthetic" | "real" | "unknown" {
  const domain = normalizeIdentityDomain(ownerDomain);
  return domain === null ? "unknown" : isDemoDomain(domain) ? "synthetic" : "real";
}

/** Privileged mailbox authentication cannot rely on reserved test/example
 * identities, even if a historical fixture carries an email verification date.
 * This does not change Organization data classification. */
export function isEligiblePrivilegedMailbox(email:string|null|undefined):boolean {
  const domain=identityEmailDomain(email);
  if(!domain||isDemoDomain(domain))return false;
  return !["test","invalid","localhost","example"].includes(domain.split(".").at(-1)!) &&
    !["example.com","example.net","example.org"].some(base=>domain===base||domain.endsWith("."+base));
}

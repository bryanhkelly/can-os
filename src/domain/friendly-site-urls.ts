/** Human-facing Site navigation. IDs stay canonical in every domain service. */
export type FriendlySiteIdentity = {
  organizationSlug: string;
  siteSlug: string;
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Existing Organization/Site slugs are not public share tokens. */
export function validFriendlySlug(value: string): boolean {
  return value.length >= 1 && value.length <= 80 && slugPattern.test(value);
}

export function friendlySiteBase(identity: FriendlySiteIdentity): string {
  if (!validFriendlySlug(identity.organizationSlug) || !validFriendlySlug(identity.siteSlug))
    throw new Error("Invalid Site route identity");
  return `/o/${identity.organizationSlug}/${identity.siteSlug}`;
}

export function friendlySiteLaunchHref(identity: FriendlySiteIdentity, module?: string): string {
  const base = friendlySiteBase(identity) + "/launch";
  return module ? `${base}?module=${encodeURIComponent(module)}` : base;
}

export function friendlySiteWebsiteHref(identity: FriendlySiteIdentity): string {
  return friendlySiteBase(identity) + "/website";
}

/** Only resolve against a server-authorized directory, never unscoped IDs. */
export function findAuthorizedSiteBySlugs<
  O extends { id: string; slug: string },
  S extends { organizationId: string; slug: string }
>(
  organizations: readonly O[], sites: readonly S[], identity: FriendlySiteIdentity,
): S | null {
  if (!validFriendlySlug(identity.organizationSlug) || !validFriendlySlug(identity.siteSlug))
    return null;
  const organization = organizations.find(item => item.slug === identity.organizationSlug);
  if (!organization) return null;
  return sites.find(item =>
    item.organizationId === organization.id && item.slug === identity.siteSlug) ?? null;
}

/**
 * Personal account surfaces must not imply that browsing or saving a Site
 * authorizes enrollment, employment, guardianship or access to school records.
 */
export function canSavePublishedSite(
  publication: { status: string; publishedAt: Date | null } | null | undefined,
): boolean {
  return publication?.status === "published" &&
    publication.publishedAt instanceof Date &&
    Number.isFinite(publication.publishedAt.getTime());
}

/** Bookmark permission does not create or expand any access grant. */
export function canBookmarkSite(input: {
  siteId: string;
  authorizedSiteIds: ReadonlySet<string>;
  publication: { status: string; publishedAt: Date | null } | null | undefined;
}): boolean {
  return input.authorizedSiteIds.has(input.siteId) || canSavePublishedSite(input.publication);
}

/** Different canonical Persons cannot be silently merged under the same login. */
export function accountPersonNeedsReview(
  grants: readonly { personId: string }[],
  demoAccountSwitching: boolean,
): boolean {
  return !demoAccountSwitching && new Set(grants.map(grant => grant.personId)).size > 1;
}

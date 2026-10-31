/**
 * Site publication approves a public landing/catalog only. It does not open
 * admissions, publish individual Programs, or change activity registration.
 */
export type SitePublicationAction = "publish" | "unpublish";
export type SitePublicationStatus = "draft" | "published";

export type SitePublicationRecord = {
  status: string;
  publishedAt: Date | null;
  updatedAt: Date;
};

export function planSitePublicationTransition(input: {
  current: SitePublicationRecord;
  action: SitePublicationAction;
  expectedRevision: string;
  reason: string;
  contentReviewed: boolean;
  eligibleOfferingCount: number;
  now: Date;
}): {
  changed: boolean;
  status: SitePublicationStatus;
  publishedAt: Date | null;
  updatedAt: Date;
} {
  const { current, action, now } = input;
  if (current.status !== "draft" && current.status !== "published") {
    throw new Error("Unknown Site publication status");
  }
  if ((current.status === "draft" && current.publishedAt !== null) ||
      (current.status === "published" && !(current.publishedAt instanceof Date))) {
    throw new Error("Site publication state requires repair");
  }
  const target: SitePublicationStatus = action === "publish" ? "published" : "draft";
  if (current.status === target) {
    // No new write, event, or audit for a repeated request. A later opposite
    // action cannot be overwritten by replaying a stale revision.
    return { changed: false, status: target,
      publishedAt: current.publishedAt, updatedAt: current.updatedAt };
  }
  if (current.updatedAt.toISOString() !== input.expectedRevision) {
    throw new Error("Site publication changed. Refresh and review before trying again.");
  }
  if (input.reason.trim().length < 10 || input.reason.trim().length > 500) {
    throw new Error("Provide a 10–500 character publication decision reason");
  }
  if (action === "publish" &&
      (!input.contentReviewed || input.eligibleOfferingCount < 1)) {
    throw new Error("Review the public content and include at least one eligible published academic or enrichment listing");
  }
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid publication clock");
  // Updated revision must change even if two commands happen in the same ms.
  const updatedAt = new Date(Math.max(now.getTime(), current.updatedAt.getTime() + 1));
  return {
    changed: true,
    status: target,
    publishedAt: action === "publish" ? now : null,
    updatedAt,
  };
}

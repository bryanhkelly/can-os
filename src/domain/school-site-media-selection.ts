/**
 * School Sites folder-first media composition.
 *
 * A church selects a folder/source, never a hero photo or page-by-page image
 * during onboarding. An upstream authorized importer scans the selected folder
 * and supplies per-image classification, provenance, and approved rights.
 *
 * This pure selection function has NO filesystem, URL-fetch or publish authority.
 * It never grants rights, creates an image, bypasses approval, or claims that an
 * automatic computer-vision classification is a legal consent decision.
 */
export const schoolSiteMediaSlots = [
  "hero", "about", "academics", "studentLife", "campus", "families",
] as const;
export type SchoolSiteMediaSlot = (typeof schoolSiteMediaSlots)[number];

export type SiteMediaPhoto = {
  /** Canonical, site-scoped media object, not a remote image URL. */
  id: string;
  siteId: string;
  width: number;
  height: number;
  /** Reviewer-supplied or reviewed machine-suggested semantic tags. */
  tags: readonly string[];
  altText: string;
  /** Explicit publication rights, independent of image classification. */
  rightsStatus: "approved" | "pending" | "revoked";
  /** Cleared means identifiable subjects have appropriate usage permission. */
  subjectReleaseStatus: "cleared" | "not_required" | "pending" | "denied";
  /** Original media may not be composited until reviewed. */
  mediaReviewStatus: "approved" | "pending" | "rejected";
  /** Identifier for the current source-folder/file revision; not an assertion of rights. */
  sourceRevision: string;
  /** A reviewed art-direction group; enables cohesive selection. */
  visualFamily?: string | null;
};

export type SiteMediaAssignment = {
  slot: SchoolSiteMediaSlot;
  assetId: string;
  sourceRevision: string;
  /** Output renderer selects actual CSS object-position and responsive variants. */
  crop: "wide" | "landscape" | "square";
  /** The reason is metadata for audit/editor review, not public marketing copy. */
  matchedTags: readonly string[];
};

export type SiteMediaPlan = {
  assignments: SiteMediaAssignment[];
  unfilled: SchoolSiteMediaSlot[];
  /** No media is published by the planner. All assignments remain candidate output. */
  status: "review_required";
};

const slotTags: Record<SchoolSiteMediaSlot, readonly string[]> = {
  hero: ["school", "community", "students", "classroom", "campus", "learning"],
  about: ["church", "community", "leadership", "gathering", "school"],
  academics: ["classroom", "learning", "science", "stem", "teacher", "books"],
  studentLife: ["activities", "arts", "sports", "service", "students", "community"],
  campus: ["campus", "building", "outdoors", "facilities", "classroom"],
  families: ["family", "community", "gathering", "events", "welcome"],
};

const minWidth: Record<SchoolSiteMediaSlot, number> = {
  hero: 1200, about: 640, academics: 640, studentLife: 640, campus: 640, families: 640,
};

function eligible(siteId: string, photo: SiteMediaPhoto): boolean {
  return photo.siteId === siteId &&
    photo.mediaReviewStatus === "approved" &&
    photo.rightsStatus === "approved" &&
    ["cleared", "not_required"].includes(photo.subjectReleaseStatus) &&
    photo.altText.trim().length > 0 &&
    photo.sourceRevision.trim().length > 0 &&
    photo.width > 0 && photo.height > 0;
}

function score(slot: SchoolSiteMediaSlot, photo: SiteMediaPhoto, preferredFamily: string | null): number {
  const tags = new Set(photo.tags.map(tag => tag.trim().toLowerCase()));
  const matches = slotTags[slot].filter(tag => tags.has(tag));
  const ratio = photo.width / photo.height;
  const geometry = slot === "hero" ? ratio >= 1.5 ? 9 : ratio >= 1.2 ? 4 : -6 :
    ratio >= 1.2 && ratio <= 2.25 ? 5 : ratio >= .85 ? 2 : 0;
  const resolution = photo.width >= minWidth[slot] ? 4 : -12;
  const cohesion = preferredFamily && photo.visualFamily === preferredFamily ? 5 : 0;
  return matches.length * 12 + geometry + resolution + cohesion;
}

/** Deterministic and fail-closed: if content/rights are missing, leave a slot
 * empty. The renderer must use intentional non-photographic layout fallbacks. */
export function planSchoolSiteMedia(
  siteId: string,
  photos: readonly SiteMediaPhoto[],
): SiteMediaPlan {
  const pool = photos.filter(photo => eligible(siteId, photo));
  const used = new Set<string>();
  const assignments: SiteMediaAssignment[] = [];
  const unfilled: SchoolSiteMediaSlot[] = [];
  let visualFamily: string | null = null;
  for (const slot of schoolSiteMediaSlots) {
    const options = pool.filter(photo => !used.has(photo.id))
      .map(photo => ({photo, rank: score(slot, photo, visualFamily)}))
      .filter(choice => choice.rank >= 12)
      .sort((a, b) => b.rank - a.rank || a.photo.id.localeCompare(b.photo.id));
    const chosen = options[0]?.photo;
    if (!chosen) { unfilled.push(slot); continue; }
    used.add(chosen.id);
    visualFamily ??= chosen.visualFamily ?? null;
    const recognized = new Set(chosen.tags.map(tag => tag.trim().toLowerCase()));
    assignments.push({
      slot,assetId:chosen.id,sourceRevision:chosen.sourceRevision,
      crop:slot === "hero" ? "wide" : slot === "studentLife" ? "square" : "landscape",
      matchedTags:slotTags[slot].filter(tag => recognized.has(tag)),
    });
  }
  return {assignments,unfilled,status:"review_required"};
}

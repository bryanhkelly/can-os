/**
 * Presentation-only native Course/Offering release checkpoints.
 *
 * These are observed records, never authorization decisions. A recorded
 * review may expire or be withdrawn after the read; server commands recheck
 * verified identity, independent reviewers, release policy and rights.
 */
export type ReleaseCheckpointStatus =
  | "recorded" | "action_required" | "pending" | "unverified";

export type ReleaseReviewKind =
  | "academic" | "rights" | "accessibility" | "coverage" | "safety";
export type ReleaseReviewDecision =
  | "approved" | "rejected" | "withdrawn" | "not_reviewed";

export interface NativeReleaseCheckpointInput {
  courseCount: number;
  lessonCount?: number;
  allCoursesPublished: boolean;
  manifest: {
    current: boolean;
    status: "draft" | "approved";
    assetCount: number;
  } | null;
  releasePoliciesComplete: boolean;
  offeringPublished: boolean;
  /** Omitted for creators: reviewer decisions are not disclosed by author feeds. */
  reviews?: readonly {
    kind: ReleaseReviewKind;
    decision: ReleaseReviewDecision;
  }[];
}

export type NativeReleaseCheckpoint = {
  key: "content" | "submission" | "review" | "course" | "assets" |
    "assetApproval" | "offering";
  label: string;
  status: ReleaseCheckpointStatus;
  detail: string;
};

const requiredReviewKinds: readonly ReleaseReviewKind[] = [
  "academic", "rights", "accessibility", "coverage", "safety",
];

export function projectNativeReleaseCheckpoints(
  state: NativeReleaseCheckpointInput,
): NativeReleaseCheckpoint[] {
  const manifestCurrent = !!state.manifest?.current;
  const assetCount = state.manifest?.assetCount ?? 0;
  const reviews = state.reviews;
  const recordedReviews = manifestCurrent && reviews !== undefined &&
    requiredReviewKinds.every(kind => reviews.some(review =>
      review.kind === kind && review.decision === "approved"));
  const rejectedReviews = manifestCurrent && reviews?.some(review =>
    review.decision === "rejected" || review.decision === "withdrawn");

  const contentPresent = state.courseCount > 0 &&
    (state.lessonCount === undefined || state.lessonCount > 0);
  const publishedOffering = state.offeringPublished;

  return [
    {
      key: "content",
      label: "Native Course composition",
      status: contentPresent ? "recorded" : "action_required",
      detail: contentPresent
        ? "Course composition is present. Publication still requires an independent decision."
        : "Add a native Course with instructional lessons before submission.",
    },
    {
      key: "submission",
      label: "Exact content submission",
      status: manifestCurrent ? "recorded" : "action_required",
      detail: manifestCurrent
        ? "The latest submitted content fingerprint matches the currently read Course and Offering."
        : "Submit the current manuscript or a new asset-backed snapshot for review.",
    },
    {
      key: "review",
      label: "Independent content decisions",
      status: !manifestCurrent ? "pending" :
        reviews === undefined ? "unverified" :
          recordedReviews ? "recorded" :
            rejectedReviews ? "action_required" : "pending",
      detail: recordedReviews
        ? "All five review categories have recorded approvals. Current evidence is rechecked by the publication command."
        : !manifestCurrent
          ? "Review cannot complete before submission of the current composition."
          : reviews === undefined
            ? "Independent reviewer decisions are not exposed in this creator view."
            : rejectedReviews
              ? "At least one current review category requires changes or renewed approval."
              : "Academic, rights, accessibility, coverage and safety decisions are still incomplete.",
    },
    {
      key: "course",
      label: "Native Course publication",
      status: state.allCoursesPublished ? "recorded" : "pending",
      detail: state.allCoursesPublished
        ? "The constituent native Course versions are published."
        : "Course publication requires all current independent content approvals.",
    },
    {
      key: "assets",
      label: "Release assets and Course policies",
      status: assetCount > 0 && manifestCurrent && state.releasePoliciesComplete
        ? "recorded" : "action_required",
      detail: assetCount > 0 && manifestCurrent && state.releasePoliciesComplete
        ? "Real immutable asset versions and explicit policies are attached to this snapshot. Rights are checked again at publication."
        : "Final Offering release needs current publisher-owned reviewed assets and a release policy for every Course.",
    },
    {
      key: "assetApproval",
      label: "Asset manifest approval",
      status: manifestCurrent && assetCount > 0 &&
        state.manifest?.status === "approved" ? "recorded" : "pending",
      detail: manifestCurrent && assetCount > 0 &&
        state.manifest?.status === "approved"
        ? "The exact asset-bearing content manifest has an approved database status."
        : "An independent publisher reviewer must approve the current asset-backed manifest.",
    },
    {
      key: "offering",
      label: "Offering publication",
      status: publishedOffering ? "recorded" : "pending",
      detail: publishedOffering
        ? "The Offering version has a published lifecycle. Local adoption and Class activation remain separate."
        : "A published native Course and an approved manifest do not by themselves publish this Offering.",
    },
  ];
}

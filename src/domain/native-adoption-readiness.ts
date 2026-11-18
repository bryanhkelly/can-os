import { publisherReleaseAvailableForAdoption, type AdoptionPublisherRelease } from "./native-offering-adoption-publication";

/** Current review categories already enforced by the approval service. */
export const nativeAdoptionReviewKinds = ["operating","registration","delivery"] as const;
export type NativeAdoptionReviewKind = typeof nativeAdoptionReviewKinds[number];

export type NativeAdoptionEvidencePreview = AdoptionPublisherRelease & {
  blueprintExecutionRecorded: boolean;
  readiness: ReadonlyArray<{kind:string;recordedReady:boolean}>;
  evidencePreviewLimited: boolean;
};

/**
 * Advisory evidence preview, never approval authority.
 * Unknown, truncated, expired and unrecorded prerequisites must fail closed.
 */
export function adoptionPreviewAllowsAttempt(
  state:NativeAdoptionEvidencePreview,
):boolean {
  return !state.evidencePreviewLimited &&
    publisherReleaseAvailableForAdoption(state) &&
    state.blueprintExecutionRecorded &&
    nativeAdoptionReviewKinds.every(kind =>
      state.readiness.some(row=>row.kind===kind&&row.recordedReady));
}

/**
 * A visible publisher release is a prerequisite for local adoption review,
 * not proof of Blueprint, Site, reviewer or Class authorization.
 * The server still revalidates every dependency inside the approval transaction.
 */
export type AdoptionPublisherRelease = {
  lifecycle: string;
  publishedAt: Date | string | null;
  offeringStatus: string;
};

export function publisherReleaseAvailableForAdoption(
  state: AdoptionPublisherRelease,
): boolean {
  return state.lifecycle === "published" &&
    state.publishedAt != null &&
    state.offeringStatus === "active";
}

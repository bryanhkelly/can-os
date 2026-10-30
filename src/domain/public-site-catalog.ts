/**
 * Public site pages explicitly whitelist safe listing fields.
 * Do not spread a canonical enrichment DTO or its package/session metadata
 * into a public response: guardian consent wording and internal IDs belong
 * to the authenticated registration flow.
 */
export type PublicSiteEnrichmentInput = {
  seasonId: string;
  name: string;
  seasonName: string;
  programName: string;
  startsOn: string;
  endsOn: string;
  feeAmountCents: number;
  seatsRemaining: number | null;
  registrationOpen: boolean;
  firstMeeting: string | null;
  meetingTimezone: string | null;
  packages: ReadonlyArray<{
    id: string; title: string; priceCents: number;
    available: boolean; seatsRemaining: number | null;
  }>;
};

export function toPublicSiteEnrichment(item: PublicSiteEnrichmentInput) {
  return {
    seasonId: item.seasonId,
    title: item.name,
    season: item.seasonName,
    programName: item.programName,
    startsOn: item.startsOn,
    endsOn: item.endsOn,
    feeAmountCents: item.feeAmountCents,
    seatsRemaining: item.seatsRemaining,
    registrationOpen: item.registrationOpen,
    firstMeeting: item.firstMeeting,
    meetingTimezone: item.meetingTimezone,
    packages: item.packages.map(pkg => ({
      id: pkg.id,
      title: pkg.title,
      priceCents: pkg.priceCents,
      available: pkg.available,
      seatsRemaining: pkg.seatsRemaining,
    })),
  };
}

/** Reservation alone never authorizes public listing. */
export function isSitePubliclyPublished(input: {
  status: string;
  publishedAt: Date | null;
}): boolean {
  return input.status === "published" &&
    input.publishedAt instanceof Date &&
    Number.isFinite(input.publishedAt.getTime());
}

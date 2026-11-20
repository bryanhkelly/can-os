/**
 * Read-only projection of existing CAN OS launch authorities.
 * Program intent, Solution configuration, published learning product,
 * provider eligibility and enrollment releases are distinct records.
 * Nothing here grants approval or infers completion from planning.
 *
 * Used by both Prepare and Open; deliberately not COGIC-specific.
 */
export type JourneyTemplate = {
  blueprintVersionId: string;
  title: string;
  versionNo: number;
  programCode: string | null;
  offeringCode: string | null;
  linkedPublishedOffering: { offeringVersionId: string } | null;
  components: readonly { key: string }[];
};
export type JourneyPlan = {
  configurationId: string;
  blueprintVersionId: string;
  lifecycle: string;
};
export type JourneyCandidate = {
  offeringCode: string;
  siteOptions: readonly { id: string }[];
  digitalSiteOptions: readonly { id: string }[];
};
export type JourneyRelease = {
  offeringCode: string;
  siteId: string;
  status: string;
  opensAt: Date | string;
  closesAt: Date | string;
};
export type ProgramOfferingJourney = {
  programCode: string;
  solution: JourneyTemplate | null;
  savedPlan: JourneyPlan | null;
  offeringPublished: boolean;
  publisherCandidateCount: number | null;
  releasedCount: number | null;
  openRegistrationCount: number | null;
  facilitatedFourSessions: boolean;
};

export function projectProgramOfferingJourneys({
  programCodes, templates, plans, siteId, candidates, releases, now = new Date(),
}: {
  programCodes: readonly string[];
  templates: readonly JourneyTemplate[];
  plans: readonly JourneyPlan[];
  siteId: string;
  /** Undefined means this viewer's publisher authority could not be checked. */
  candidates?: readonly JourneyCandidate[];
  releases?: readonly JourneyRelease[];
  now?: Date;
}): ProgramOfferingJourney[] {
  const selected = [...new Set(programCodes)];
  return selected.map(programCode => {
    const matching = templates.filter(t => t.programCode === programCode);
    // Honor the exact saved version when a Site already configured a Solution.
    // A new CAN-published version never silently replaces a saved version.
    const selectedPlan = plans.find(p => matching.some(t =>
      t.blueprintVersionId === p.blueprintVersionId)) ?? null;
    const solution = (
      matching.find(t => t.blueprintVersionId === selectedPlan?.blueprintVersionId)
      ?? [...matching].sort((a, b) => b.versionNo - a.versionNo)[0]
      ?? null
    );
    const offeringCode = solution?.offeringCode;
    const eligible = candidates && offeringCode
      ? candidates.filter(c => c.offeringCode === offeringCode &&
          [...c.siteOptions, ...c.digitalSiteOptions].some(s => s.id === siteId))
      : candidates ? [] : null;
    const recorded = releases && offeringCode
      ? releases.filter(r => r.offeringCode === offeringCode && r.siteId === siteId)
      : releases ? [] : null;
    const open = recorded?.filter(r =>
      r.status === "published" &&
      new Date(r.opensAt).getTime() <= now.getTime() &&
      new Date(r.closesAt).getTime() > now.getTime()) ?? null;
    return {
      programCode,
      solution,
      savedPlan: selectedPlan,
      offeringPublished: !!solution?.linkedPublishedOffering,
      publisherCandidateCount: eligible?.length ?? null,
      releasedCount: recorded?.length ?? null,
      openRegistrationCount: open?.length ?? null,
      facilitatedFourSessions: !!solution?.components.some(c => c.key === "four_session_calendar"),
    };
  });
}

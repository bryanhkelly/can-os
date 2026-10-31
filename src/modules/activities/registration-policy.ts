export type RegistrationSeason = {
  seasonStatus: string;
  startsOn: string;
  endsOn: string;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
};

/** Fail closed for unpublished or finished seasons, including stale client submissions. */
export function assertSeasonRegistrationOpen(season: RegistrationSeason, now: Date): void {
  if (season.seasonStatus !== "registration") {
    throw new Error("Activity registration is not open");
  }
  if (season.registrationOpensAt && now < season.registrationOpensAt) {
    throw new Error("Activity registration has not opened");
  }
  if (season.registrationClosesAt && now > season.registrationClosesAt) {
    throw new Error("Activity registration has closed");
  }
  // Calendar-day comparisons must not depend on the server's timezone.
  const today = now.toISOString().slice(0, 10);
  if (today > season.endsOn) {
    throw new Error("Activity season has ended");
  }
  if (season.startsOn > season.endsOn) {
    throw new Error("Invalid activity season dates");
  }
}

/**
 * The legacy activity path has no verified extended-learning launch evidence.
 * A registration-status season alone is NOT authorization to enroll minors.
 * Fail closed until an audited, evidence-backed opening command exists.
 */
export function assertLegacyActivityRegistrationAllowed(
  programType: string | null,
): void {
  if (programType === "summer_program" ||
      programType === "summer_enrichment" ||
      programType === "after_school_enrichment") {
    throw new Error("Extended-learning registration requires verified season-opening safeguards");
  }
}

/** Server-derived prerequisite evidence. Missing records always block publication. */
export type ExtendedSeasonOpeningEvidence = {
  programStatus: string | null;
  seasonStatus: string;
  siteMatchesProgram: boolean;
  capacity: number | null;
  approvedSafeguardingCoverage: boolean;
  verifiedOnsiteStaffing: boolean;
  emergencyResponsePlanApproved: boolean;
  pickupAndReleasePolicyApproved: boolean;
  datedSessionsAndCoverageVerified: boolean;
};

/** Until independently reviewed approvals have durable server-side sources, they are unavailable.
 * Never derive child-safety clearance from an operator attestation, an Action,
 * a login grant, calendar metadata, or a previously published Season.
 */
export const unavailableExtendedSeasonApprovals = Object.freeze({
  approvedSafeguardingCoverage: false,
  verifiedOnsiteStaffing: false,
  emergencyResponsePlanApproved: false,
  pickupAndReleasePolicyApproved: false,
  datedSessionsAndCoverageVerified: false,
});

export function extendedRegistrationOpeningReadiness(e: ExtendedSeasonOpeningEvidence) {
  const blockers: string[] = [];
  if (e.programStatus !== "active") blockers.push("Program must be operationally active");
  if (e.seasonStatus !== "draft") blockers.push("Only a draft season can be published");
  if (!e.siteMatchesProgram) blockers.push("Activity and Program must share the same site");
  if (e.capacity === null || !Number.isSafeInteger(e.capacity) || e.capacity < 1)
    blockers.push("A positive seat capacity is required");
  if (!e.approvedSafeguardingCoverage) blockers.push("Approved site safeguarding response and escalation coverage");
  if (!e.verifiedOnsiteStaffing) blockers.push("Screened, trained, assigned onsite supervision");
  if (!e.emergencyResponsePlanApproved) blockers.push("Site emergency response plan approved");
  if (!e.pickupAndReleasePolicyApproved) blockers.push("Authorized child pickup and release policy approved");
  if (!e.datedSessionsAndCoverageVerified) blockers.push("Dated sessions with verified staff coverage");
  return { ready: blockers.length === 0, blockers };
}

/**
 * The SAME prerequisites protect initial publication, published-season retries
 * and child registration. Only trusted server-read evidence may supply approvals.
 * A published Season is not grandfathered merely because it has a permission
 * statement in metadata.
 */
export function assertVerifiedExtendedSeasonOpening(
  evidence: ExtendedSeasonOpeningEvidence,
  action: "publish" | "register",
): void {
  if (action === "publish" && evidence.seasonStatus !== "draft")
    throw new Error("Only a draft extended-learning Season may open registration");
  if (action === "register" && evidence.seasonStatus !== "registration")
    throw new Error("Extended-learning registration is not open");
  const checked = extendedRegistrationOpeningReadiness({
    ...evidence,
    seasonStatus: "draft", // Status is independently checked above for each operation.
  });
  if (!checked.ready)
    throw new Error("Extended-learning registration is blocked: " + checked.blockers.join("; "));
}

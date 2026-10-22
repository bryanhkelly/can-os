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

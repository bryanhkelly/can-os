/**
 * A structural launch guard for a site's safeguarding coverage.
 *
 * This helper never verifies a report, a person's qualification, agency
 * availability or legal compliance. Callers must obtain every field from
 * authorized server-side records, not from an onsite reporter's request.
 */
export type SafeguardingSiteCoverage = {
  siteId: string;
  primarySiteResponderPersonId: string | null;
  backupSiteResponderPersonId: string | null;
  canSchoolOfRecordLeadPersonId: string | null;
  approvedJurisdictionProcedureVersion: string | null;
  procedureApprovedByPersonId: string | null;
  externalReportingInstructionsAvailable: boolean;
  emergencyResponseInstructionsAvailable: boolean;
  afterHoursAndOfflineFallbackAvailable: boolean;
  caseLevelRestrictedAccessEnabled: boolean;
  coverageConfirmedAt: Date | null;
};

export const MAX_SAFEGUARDING_ROSTER_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A site cannot be considered operationally READY merely because it has a
 * room facilitator assigned or an incident table in Postgres.
 */
export function evaluateSafeguardingSiteCoverage(
  coverage: SafeguardingSiteCoverage,
  now: Date = new Date(),
): { readyForOnsiteLaunchReview: boolean; blockingIssues: string[] } {
  const issues: string[] = [];
  if (!coverage.siteId) issues.push("site_identity_missing");
  if (!coverage.primarySiteResponderPersonId) issues.push("primary_responder_missing");
  if (!coverage.backupSiteResponderPersonId) issues.push("backup_responder_missing");
  if (coverage.primarySiteResponderPersonId &&
      coverage.primarySiteResponderPersonId === coverage.backupSiteResponderPersonId) {
    issues.push("responder_has_no_distinct_backup");
  }
  if (!coverage.canSchoolOfRecordLeadPersonId) issues.push("school_of_record_lead_missing");
  if (!coverage.approvedJurisdictionProcedureVersion ||
      !coverage.procedureApprovedByPersonId) issues.push("jurisdiction_policy_not_approved");
  if (!coverage.externalReportingInstructionsAvailable)
    issues.push("direct_outside_reporting_instructions_missing");
  if (!coverage.emergencyResponseInstructionsAvailable)
    issues.push("emergency_instructions_missing");
  if (!coverage.afterHoursAndOfflineFallbackAvailable)
    issues.push("after_hours_or_offline_fallback_missing");
  if (!coverage.caseLevelRestrictedAccessEnabled)
    issues.push("restricted_case_access_missing");
  const age = now.getTime() - (coverage.coverageConfirmedAt?.getTime() ?? NaN);
  if (!Number.isFinite(age) || age < 0 || age > MAX_SAFEGUARDING_ROSTER_AGE_MS)
    issues.push("response_roster_not_recently_confirmed");
  return { readyForOnsiteLaunchReview: issues.length === 0, blockingIssues: issues };
}

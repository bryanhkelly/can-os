import { describe, expect, it } from "vitest";
import {
  evaluateSafeguardingSiteCoverage,
  type SafeguardingSiteCoverage,
} from "@/domain/safeguarding-site-coverage";

const now = new Date("2026-10-22T17:00:00Z");
const coverage: SafeguardingSiteCoverage = {
  siteId: "site-a",
  primarySiteResponderPersonId: "person-a",
  backupSiteResponderPersonId: "person-b",
  canSchoolOfRecordLeadPersonId: "person-c",
  approvedJurisdictionProcedureVersion: "CA-2026-reviewed",
  procedureApprovedByPersonId: "person-legal",
  externalReportingInstructionsAvailable: true,
  emergencyResponseInstructionsAvailable: true,
  afterHoursAndOfflineFallbackAvailable: true,
  caseLevelRestrictedAccessEnabled: true,
  coverageConfirmedAt: new Date("2026-10-20T17:00:00Z"),
};

describe("onsite safeguarding readiness - fail closed", () => {
  it("recognizes the minimum site, backup and CAN coordination fields for REVIEW only", () => {
    expect(evaluateSafeguardingSiteCoverage(coverage, now)).toEqual({
      readyForOnsiteLaunchReview: true, blockingIssues: [],
    });
  });
  it("blocks an unstaffed or unapproved site with a usable list of missing prerequisites", () => {
    const result = evaluateSafeguardingSiteCoverage({
      ...coverage,
      primarySiteResponderPersonId: null,
      backupSiteResponderPersonId: null,
      canSchoolOfRecordLeadPersonId: null,
      approvedJurisdictionProcedureVersion: null,
      procedureApprovedByPersonId: null,
      externalReportingInstructionsAvailable: false,
      emergencyResponseInstructionsAvailable: false,
      afterHoursAndOfflineFallbackAvailable: false,
      caseLevelRestrictedAccessEnabled: false,
      coverageConfirmedAt: null,
    }, now);
    expect(result.readyForOnsiteLaunchReview).toBe(false);
    expect(result.blockingIssues).toContain("primary_responder_missing");
    expect(result.blockingIssues).toContain("school_of_record_lead_missing");
    expect(result.blockingIssues).toContain("direct_outside_reporting_instructions_missing");
    expect(result.blockingIssues).toContain("restricted_case_access_missing");
    expect(result.blockingIssues).toContain("response_roster_not_recently_confirmed");
  });
  it("does not accept a single person as their own on-duty fallback", () => {
    const result = evaluateSafeguardingSiteCoverage({
      ...coverage,
      backupSiteResponderPersonId: coverage.primarySiteResponderPersonId,
    }, now);
    expect(result.blockingIssues).toContain("responder_has_no_distinct_backup");
  });
  it("rejects outdated or future-dated roster confirmation", () => {
    expect(evaluateSafeguardingSiteCoverage({
      ...coverage, coverageConfirmedAt: new Date("2026-08-01T00:00:00Z"),
    }, now).readyForOnsiteLaunchReview).toBe(false);
    expect(evaluateSafeguardingSiteCoverage({
      ...coverage, coverageConfirmedAt: new Date("2026-10-23T00:00:00Z"),
    }, now).blockingIssues).toContain("response_roster_not_recently_confirmed");
  });
});

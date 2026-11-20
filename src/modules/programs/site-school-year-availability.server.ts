import { and, eq, isNull, lte, or, gt } from "drizzle-orm";
import { db } from "@/db/client";
import {
  programs, programSiteAuthorizations, schoolConfigurationVersions,
} from "@/db/schema";
import {
  noSchoolYearAvailability, type SchoolYearAvailability,
} from "@/domain/site-program-access-v61";
import { preparesSchoolYear } from "@/domain/site-launch-preparation";
import { AuthorizationError } from "@/domain/command-context";
import { requireCurrentSchoolJurisdictionForOpening } from "./school-jurisdiction-opening-gate.server";

type Reader = Pick<typeof db, "select">;

function schoolGradeNumber(value: string): number | null {
  if (value.trim().toLowerCase() === "k") return 0;
  const match = /^(?:grade\s*)?(\d{1,2})$/i.exec(value.trim());
  return match ? Number(match[1]) : null;
}

/** This is an advisory enablement projection for the school-year choices.
 * It reuses existing *independent* Site/Program/configuration review,
 * current effective dates, and the current school-jurisdiction opening
 * gate. An active demo Program or a claimed address is not approval.
 * Non-school Programs are not evaluated here and remain selectable for
 * planning regardless of the academic authority result.
 */
export async function readSiteSchoolYearAvailability(
  tx: Reader,
  siteId: string,
  now = new Date(),
): Promise<SchoolYearAvailability> {
  const candidates = await tx.select({
    id: programs.id,
    type: programs.type,
    status: programs.status,
    gradeRange: programs.gradeRange,
    configurationStatus: schoolConfigurationVersions.status,
    approvedAt: schoolConfigurationVersions.approvedAt,
    approvedByPersonId: schoolConfigurationVersions.approvedByPersonId,
    agreementStatus: programSiteAuthorizations.status,
    agreementReviewedAt: programSiteAuthorizations.reviewedAt,
    agreementReviewer: programSiteAuthorizations.reviewedByPersonId,
    agreementRequester: programSiteAuthorizations.requestedByPersonId,
    agreementEvidence: programSiteAuthorizations.evidenceDocumentId,
  }).from(programs)
    .innerJoin(schoolConfigurationVersions,
      eq(schoolConfigurationVersions.programId, programs.id))
    .innerJoin(programSiteAuthorizations,
      and(eq(programSiteAuthorizations.programId, programs.id),
        eq(programSiteAuthorizations.siteId, siteId)))
    .where(and(
      eq(programs.siteId, siteId),
      eq(schoolConfigurationVersions.status, "approved"),
      eq(programSiteAuthorizations.status, "approved"),
      lte(schoolConfigurationVersions.effectiveFrom, now),
      lte(programSiteAuthorizations.effectiveFrom, now),
      or(isNull(programSiteAuthorizations.effectiveThrough),
        gt(programSiteAuthorizations.effectiveThrough, now)),
      isNull(programSiteAuthorizations.revokedAt),
      isNull(programSiteAuthorizations.suspendedAt),
    ));

  const available: SchoolYearAvailability = { ...noSchoolYearAvailability };
  for (const candidate of candidates) {
    if (!preparesSchoolYear(candidate) ||
        !candidate.approvedAt || candidate.approvedAt > now ||
        !candidate.approvedByPersonId || !candidate.agreementReviewedAt ||
        candidate.agreementReviewedAt > now || !candidate.agreementReviewer ||
        candidate.agreementRequester === candidate.agreementReviewer ||
        !candidate.agreementEvidence) continue;
    // This guard checks current independently reviewed Site geography,
    // jurisdiction requirements and address revisions. It never opens
    // enrollment or grants the caller new rights.
    try {
      await requireCurrentSchoolJurisdictionForOpening(tx, candidate.id, {
        now, requiredPhases: ["before_opening"],
      });
    } catch (error) {
      if (error instanceof AuthorizationError) continue;
      throw error;
    }
    const low = schoolGradeNumber(candidate.gradeRange.min);
    const high = schoolGradeNumber(candidate.gradeRange.max);
    if (low === null || high === null || low > high) continue;
    if (low <= 6 && high >= 8) available["grades-6-8"] = true;
    if (low <= 9 && high >= 12) available["grades-9-12"] = true;
  }
  return available;
}

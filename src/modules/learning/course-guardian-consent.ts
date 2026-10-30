/**
 * Pure policy projection over append-only guardian decisions for a single
 * course-registration Action. Input must already be ordered newest-first and
 * filtered to active, supported-version consent records.
 *
 * Never treat the Action metadata or the latest decision of a former guardian
 * as authority. An active managing guardian must be the signer.
 */
export type CourseGuardianDecision = {
  signerPersonId: string;
  evidence: Record<string, unknown>;
};

export type GuardianApprovalState = "pending" | "approved" | "declined";

export function resolveCourseGuardianConsent(input: {
  eligibleGuardianPersonIds: readonly string[];
  decisionsNewestFirst: readonly CourseGuardianDecision[];
  studentProfileId: string;
  sectionId: string;
  schoolYearId: string;
}): GuardianApprovalState {
  const authorized = new Set(input.eligibleGuardianPersonIds);
  if (!authorized.size) return "pending";
  const latest = new Map<string, "approve" | "decline">();
  for (const record of input.decisionsNewestFirst) {
    if (!authorized.has(record.signerPersonId) || latest.has(record.signerPersonId)) continue;
    const evidence = record.evidence;
    if (evidence.studentProfileId !== input.studentProfileId ||
        evidence.sectionId !== input.sectionId ||
        evidence.schoolYearId !== input.schoolYearId) continue;
    if (evidence.decision === "decline") {
      latest.set(record.signerPersonId, "decline");
    } else if (evidence.decision === "approve" &&
               evidence.acknowledgedByGuardian === true) {
      latest.set(record.signerPersonId, "approve");
    }
  }
  // One authorized guardian's unresolved decline blocks enrollment even if
  // another has approved, until that guardian changes their latest decision.
  if ([...latest.values()].includes("decline")) return "declined";
  return [...latest.values()].includes("approve") ? "approved" : "pending";
}

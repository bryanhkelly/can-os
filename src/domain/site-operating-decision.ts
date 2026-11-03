/**
 * Read-only operating-day decision over canonical approval and witnessed
 * coverage evidence. This is guidance for local staff, not a permission grant
 * or replacement for the independent CAN opening-approval workflow.
 */
export type SiteOperatingDecisionStatus =
  | "opening_unverified" | "opening_blocked" | "coverage_review"
  | "handoff_review" | "evidence_present";

export type SiteOperatingDecision = {
  status: SiteOperatingDecisionStatus;
  title: string;
  detail: string;
  owner: string;
  nextStep: string;
  href: string;
  staffingExceptionCount: number;
};

export function deriveSiteOperatingDecision(input: {
  programIds: readonly string[];
  openings: readonly { programId: string; blocked: boolean }[];
  handoffs: readonly { programId: string | null; status: string }[];
  staffing: {
    blocks: readonly {
      assignedPlan: boolean; substitution: boolean;
      missingAdultReports: number; dutyStatus: string;
      coverageInterrupted: boolean; witnessedBothAdults: boolean;
    }[];
    coverageExceptions: number;
    interruptedBlocks: number;
    missingAdultReports: number;
    witnessedBlocks: number;
  };
  projectionTruncated: boolean;
}): SiteOperatingDecision {
  const staffingExceptionCount = input.staffing.blocks.filter(block =>
    !block.assignedPlan || block.substitution || block.missingAdultReports > 0 ||
    block.coverageInterrupted ||
    ["cannot_cover", "stale_after_delegation", "not_reported"].includes(block.dutyStatus)
  ).length;
  const decision = (
    status: SiteOperatingDecisionStatus, title: string, detail: string,
    owner: string, nextStep: string, href: string,
  ): SiteOperatingDecision => ({
    status, title, detail, owner, nextStep, href, staffingExceptionCount,
  });
  // A registrar may not receive local opening states. A missing projection is
  // unknown, not a tacit approval. Zero visible programs is also unknown.
  if (!input.programIds.length || !input.openings.length)
    return decision("opening_unverified", "Opening authorization not verified",
      "This workspace cannot verify an independent opening approval for the visible school. An active academic program is not permission to receive children.",
      "Church registrar and CAN opening officer", "Confirm opening authorization", "#school-day-operating-decision");
  if (input.openings.some(opening => opening.blocked))
    return decision("opening_blocked", "School opening is not authorized",
      "One or more visible church-hosted programs lack a current CAN opening approval or an ongoing prerequisite.",
      "Church registrar and CAN opening officer", "Review opening blockers", "#school-opening-authorization");
  if (input.projectionTruncated)
    return decision("opening_unverified", "Operating evidence is incomplete",
      "A source listing was capped. Current supervision and attendance cannot be fully evaluated.",
      "Local site director", "Reconcile source records", "#staffing-exceptions");
  if (!input.staffing.blocks.length || staffingExceptionCount > 0 ||
      input.staffing.coverageExceptions > 0 ||
      input.staffing.interruptedBlocks > 0 ||
      input.staffing.missingAdultReports > 0 ||
      input.staffing.witnessedBlocks < input.staffing.blocks.length)
    return decision("coverage_review", "Supervised day requires coverage review",
      "Room assignments, adult acknowledgments and independent coverage witnesses must be reconciled for the scheduled blocks. No school-day readiness is certified here.",
      "Local site director", "Review staffing and coverage", "#staffing-exceptions");
  if (input.openings.some(opening => !input.handoffs.some(handoff =>
    handoff.programId === opening.programId && handoff.status === "resolved")))
    return decision("handoff_review", "Opening handoff is not acknowledged",
      "A current opening-approval projection does not substitute for receipt by the named local operator.",
      "Named local operator", "Review opening handoff", "#opening-handoffs");
  return decision("evidence_present", "Current approval and coverage records present",
    "The visible opening, handoff and witnessed-block records have no listed blocker. Continue active supervision and custody checks. This summary is not an independent safety certification.",
    "Local site director", "Monitor the school day", "#staffing-exceptions");
}

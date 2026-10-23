/**
 * Planned instructional supervision, NOT confirmation that a person arrived,
 * a room is staffed, or a learner is physically present.
 *
 * This view consumes existing active sections, schedule periods and delivery
 * arrangements. No new attendance or private student records are created.
 */
export type SupervisionBlockInput = {
  sectionId: string;
  sectionTitle: string;
  programId: string;
  programName: string;
  periodId: string | null;
  periodLabel: string | null;
  startsAtLocal: string | null;
  endsAtLocal: string | null;
  facilitatorPersonId: string | null;
  facilitatorName: string | null;
  verifiedSiteStaffGrant: boolean;
  overlappingFacilitatorAssignments?: boolean;
};

export type SupervisionGap =
  "schedule_missing" | "facilitator_missing" | "staff_grant_missing" |
  "facilitator_conflict" | "room_unconfigured";

function minutes(input: string | null): number | null {
  if (!input) return null;
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(input);
  if (!match) return null;
  const h=Number(match[1]), m=Number(match[2]);
  return h >= 0 && h < 24 && m >= 0 && m < 60 ? h * 60 + m : null;
}

export function summarizeOnsiteSupervision(
  rows: readonly SupervisionBlockInput[],
) {
  const blocks = rows.map(row => {
    const start = minutes(row.startsAtLocal);
    const end = minutes(row.endsAtLocal);
    const gaps: SupervisionGap[] = [];
    if (!row.periodId || start === null || end === null || end <= start)
      gaps.push("schedule_missing");
    if (!row.facilitatorPersonId) gaps.push("facilitator_missing");
    else if (!row.verifiedSiteStaffGrant) gaps.push("staff_grant_missing");
    if (row.overlappingFacilitatorAssignments) gaps.push("facilitator_conflict");
    // CAN OS currently has no authoritative section-room assignment; never
    // silently claim that an instructional section has a supervised room.
    gaps.push("room_unconfigured");
    return {
      ...row, gaps, startMinute:start, endMinute:end,
      assignedPlan: gaps.every(gap => gap === "room_unconfigured"),
    };
  });
  for (let i=0;i<blocks.length;i++) {
    const a=blocks[i]!;
    if (!a.facilitatorPersonId || a.startMinute===null || a.endMinute===null) continue;
    for (let j=i+1;j<blocks.length;j++) {
      const b=blocks[j]!;
      if (a.sectionId===b.sectionId || a.facilitatorPersonId!==b.facilitatorPersonId ||
          b.startMinute===null || b.endMinute===null) continue;
      if (a.startMinute < b.endMinute && b.startMinute < a.endMinute) {
        for (const entry of [a,b]) {
          if (!entry.gaps.includes("facilitator_conflict")) entry.gaps.push("facilitator_conflict");
          entry.assignedPlan=false;
        }
      }
    }
  }
  return {
    blocks:blocks.map(({startMinute:_start,endMinute:_end,...item})=>item),
    plannedAssignments:blocks.filter(x=>x.assignedPlan).length,
    unassignedOrConflicting:blocks.filter(x=>!x.assignedPlan).length,
    roomAssignmentsUnverified:blocks.length,
    hasConfirmedPhysicalCoverage:false as const,
    note:"This is a staffing PLAN from section schedules and current assignments. No authoritative room assignment, on-duty acknowledgment, onsite presence, child release or custody approval exists in this view.",
  };
}

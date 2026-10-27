import type { CoverageWindow } from "./qualification-coverage";

export type InstructionalDeliveryCoverage = {
  instructorPersonId: string | null;
  effectiveFrom: Date | null;
  effectiveThrough: Date | null;
};

/** A Section is covered only by an assigned instructor whose active delivery
 * arrangement spans the complete instructional window. Identity authority and
 * qualification eligibility are separate decisions made by the caller.
 */
export function coveringInstructorIds(
  window: CoverageWindow,
  assignedTeacherIds: readonly string[],
  arrangements: readonly InstructionalDeliveryCoverage[],
): Set<string> {
  const assigned = new Set(assignedTeacherIds);
  return new Set(arrangements.flatMap(arrangement => {
    if (!arrangement.instructorPersonId || !assigned.has(arrangement.instructorPersonId)) return [];
    if (arrangement.effectiveFrom && arrangement.effectiveFrom > window.from) return [];
    if (arrangement.effectiveThrough && arrangement.effectiveThrough < window.through) return [];
    return [arrangement.instructorPersonId];
  }));
}

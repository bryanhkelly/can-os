import type { CoverageWindow } from "./qualification-coverage";

export type InstructionalDeliveryCoverage = {
  instructorPersonId: string | null;
  academicProviderOrganizationId: string;
  effectiveFrom: Date | null;
  effectiveThrough: Date | null;
};

/** A Section is covered only by an assigned instructor whose active delivery
 * arrangement is bound to the Program's current academic provider and spans
 * the complete instructional window. Arrangements for any other provider do
 * not count. Identity authority and qualification eligibility are separate
 * decisions made by the caller.
 */
export function coveringInstructorIds(
  window: CoverageWindow,
  providerId: string,
  assignedTeacherIds: readonly string[],
  arrangements: readonly InstructionalDeliveryCoverage[],
): Set<string> {
  const assigned = new Set(assignedTeacherIds);
  return new Set(arrangements.flatMap(arrangement => {
    if (arrangement.academicProviderOrganizationId !== providerId) return [];
    if (!arrangement.instructorPersonId || !assigned.has(arrangement.instructorPersonId)) return [];
    if (arrangement.effectiveFrom && arrangement.effectiveFrom > window.from) return [];
    if (arrangement.effectiveThrough && arrangement.effectiveThrough < window.through) return [];
    return [arrangement.instructorPersonId];
  }));
}

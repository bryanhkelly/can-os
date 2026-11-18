import {validClassroomSessionWindows} from "@/domain/classroom-scheduling";

/**
 * Bounded scheduling checks for an authorized noncredit cohort.
 *
 * Four instructional sessions are not necessarily four consecutive weeks:
 * local Sites may meet twice per week, skip holidays or change meeting length.
 * These pure checks never confer Site authority, enroll a learner or record
 * attendance. The canonical server commands recheck all scopes on mutation.
 */
export type AvailableCohortMeeting = {
  planId: string;
  linked: boolean;
  state: string;
  startsAt: string;
  endsAt: string;
};
const instant = (value: string | Date) =>
  value instanceof Date ? value.getTime() : Date.parse(value);

/** Review a human-selected subset, never silently attach the first four
 * unrelated available meetings. Up to four are submitted atomically; more
 * sessions can be added later using the same normal cohort operations.
 */
export function selectedCohortSessionPlanIds(
  meetings: readonly AvailableCohortMeeting[],
  selectedIds: readonly string[],
  nowMs = Date.now(),
): string[] {
  if (!selectedIds.length || selectedIds.length > 4 ||
    new Set(selectedIds).size !== selectedIds.length) return [];
  const byId = new Map(meetings.map(item => [item.planId, item]));
  const selected = selectedIds.map(id => byId.get(id));
  if (selected.some(row => !row || row.linked || row.state !== "scheduled" ||
    !Number.isFinite(instant(row.startsAt)) || instant(row.startsAt) <= nowMs)) return [];
  const ordered = (selected as AvailableCohortMeeting[])
    .sort((a, b) => instant(a.startsAt) - instant(b.startsAt));
  return validClassroomSessionWindows(ordered) ? ordered.map(row => row.planId) : [];
}

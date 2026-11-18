/**
 * Candidate selection for an already authorized noncredit cohort.
 * A four-session bulk attachment must never quietly become one-to-three
 * meetings or mix nonweekly dates. This is calendar validation, not
 * enrollment, attendance, Site authority or course publication.
 */
export type CohortMeetingWindow = {
  startsAt: string | Date;
  endsAt: string | Date;
};
export type AvailableCohortMeeting = {
  planId: string;
  linked: boolean;
  state: string;
  startsAt: string;
  endsAt: string;
};

const weekMs = 7 * 24 * 60 * 60_000;
const dstToleranceMs = 75 * 60_000;
const durationToleranceMs = 60_000;
const instant = (value: string | Date) =>
  value instanceof Date ? value.getTime() : Date.parse(value);
const duration = (row: CohortMeetingWindow) =>
  instant(row.endsAt) - instant(row.startsAt);

/** Allows the one-hour DST change while rejecting duplicate or off-week dates. */
export function isFourWeeklyCohort(windows: readonly CohortMeetingWindow[]): boolean {
  if (windows.length !== 4) return false;
  const ordered = [...windows].sort((a, b) => instant(a.startsAt) - instant(b.startsAt));
  const first = instant(ordered[0]!.startsAt);
  const minutes = duration(ordered[0]!);
  if (!Number.isFinite(first) || !Number.isFinite(minutes) || minutes < 15 * 60_000) return false;
  return ordered.every((row, week) => {
    const startsAt = instant(row.startsAt);
    const endsAt = instant(row.endsAt);
    return Number.isFinite(startsAt) && Number.isFinite(endsAt) &&
      Math.abs(startsAt - (first + week * weekMs)) <= dstToleranceMs &&
      Math.abs(duration(row) - minutes) <= durationToleranceMs;
  });
}

/**
 * Suggest only four distinct upcoming, unallocated meetings. Never select
 * the first four arbitrarily when a Site has multiple unrelated schedules.
 * The server repeats calendar and resource authorization checks on mutation.
 */
export function chooseFourWeekCohortPlans(
  meetings: readonly AvailableCohortMeeting[], nowMs = Date.now(),
): string[] {
  const available = meetings
    .filter(row => !row.linked && row.state === "scheduled" &&
      Number.isFinite(instant(row.startsAt)) && instant(row.startsAt) > nowMs)
    .sort((a, b) => instant(a.startsAt) - instant(b.startsAt));
  for (const first of available) {
    const selected = [first];
    for (let week = 1; week < 4; week++) {
      const target = instant(first.startsAt) + week * weekMs;
      const next = available.find(row =>
        !selected.some(used => used.planId === row.planId) &&
        Math.abs(instant(row.startsAt) - target) <= dstToleranceMs &&
        Math.abs(duration(row) - duration(first)) <= durationToleranceMs);
      if (!next) break;
      selected.push(next);
    }
    if (isFourWeeklyCohort(selected)) return selected.map(row => row.planId);
  }
  return [];
}

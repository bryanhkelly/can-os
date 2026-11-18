/** Scheduling policy for CAN's shared-screen classroom overlay.
 * The canonical delivery session owns actual time, space and Site constraints.
 */
export const classroomScheduleFutureMs=180*24*60*60_000;
export const classroomDurationMinMs=15*60_000;
export const classroomDurationMaxMs=8*60*60_000;
export const classroomEarlyStartMs=15*60_000;
export function validClassroomScheduleWindow(
  start:Date,end:Date,now:Date,
):boolean{
  const duration=end.getTime()-start.getTime();
  return Number.isFinite(start.getTime())&&Number.isFinite(end.getTime())&&
    start.getTime()>=now.getTime()+5*60_000 &&
    start.getTime()<=now.getTime()+classroomScheduleFutureMs &&
    duration>=classroomDurationMinMs&&duration<=classroomDurationMaxMs;
}
export function canOpenScheduledClassroom(start:Date,end:Date,now:Date):boolean{
  return start.getTime()-classroomEarlyStartMs<=now.getTime() &&
    now.getTime()<end.getTime();
}

/** Accept one to four distinct, nonoverlapping dated meetings, any cadence.
 * Course and Site authorization and future-time limits belong to the caller.
 */
export type ClassroomMeetingWindow = {
  startsAt: string | Date;
  endsAt: string | Date;
};
const classroomInstant = (value: string | Date) =>
  value instanceof Date ? value.getTime() : Date.parse(value);
export function validClassroomSessionWindows(
  windows: readonly ClassroomMeetingWindow[],
): boolean {
  if (windows.length < 1 || windows.length > 4) return false;
  const ordered = [...windows].sort((a, b) =>
    classroomInstant(a.startsAt) - classroomInstant(b.startsAt));
  let previousEnd = -Infinity;
  for (const row of ordered) {
    const start = classroomInstant(row.startsAt);
    const end = classroomInstant(row.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) ||
      end <= start || start < previousEnd) return false;
    previousEnd = end;
  }
  return true;
}

export type FourSessionCadence = "weekly" | "twice-weekly";

/**
 * Convenience dates, not an authoritative cadence requirement. Operators can
 * edit each session afterward to skip holidays or change meeting times.
 * Calendar-date addition preserves local wall-clock time across DST.
 */
export function fourSessionSchedulePreset(
  startLocal: string, endLocal: string, cadence: FourSessionCadence,
) {
  const start = new Date(startLocal);
  const end = new Date(endLocal);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) ||
    end.getTime() <= start.getTime()) throw new Error("Invalid first classroom meeting");
  const offsets = cadence === "weekly" ? [0, 7, 14, 21] : [0, 3, 7, 10];
  return offsets.map(days => {
    const startsAt = new Date(start);
    const endsAt = new Date(end);
    startsAt.setDate(start.getDate() + days);
    endsAt.setDate(end.getDate() + days);
    return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
  });
}

/** Backward-compatible weekly convenience for existing callers and tests. */
export function fourWeeklyClassroomWindows(startLocal: string, endLocal: string) {
  return fourSessionSchedulePreset(startLocal, endLocal, "weekly");
}

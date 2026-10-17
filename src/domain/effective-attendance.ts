/**
 * Project effective AttendanceEvent facts without deleting correction history.
 * Events are append-only; a newer revision replaces the earlier state of one
 * student/program/occurrence in read models, regardless of fetch order.
 */
export function effectiveAttendanceEvents<T extends {
  id: string;
  studentProfileId: string;
  programId: string;
  occurrenceKey: string;
  recordedAt: Date;
}>(events: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const event of events) {
    const key = [event.studentProfileId, event.programId, event.occurrenceKey].join(":");
    const current = latest.get(key);
    if (!current || event.recordedAt.getTime() > current.recordedAt.getTime() ||
        (event.recordedAt.getTime() === current.recordedAt.getTime() && event.id > current.id)) {
      latest.set(key, event);
    }
  }
  return [...latest.values()];
}

import { facilitatedRoomMaxMs } from "./facilitated-learning";

/** Optional participant feedback remains available briefly after a room
 * ends, including automatic eight-hour expiry. It is NOT attendance evidence. */
export const classroomFeedbackWindowMs = 7 * 24 * 60 * 60_000;

export function classroomFeedbackClosesAt(
  room: { startedAt: Date; endedAt: Date | null },
): Date {
  const absoluteEnd = room.startedAt.getTime() + facilitatedRoomMaxMs;
  const sessionEnd = room.endedAt
    ? Math.min(room.endedAt.getTime(), absoluteEnd) : absoluteEnd;
  return new Date(sessionEnd + classroomFeedbackWindowMs);
}

export function classroomFeedbackOpen(
  room: { startedAt: Date; endedAt: Date | null }, now: Date,
): boolean {
  return room.startedAt <= now && now < classroomFeedbackClosesAt(room);
}

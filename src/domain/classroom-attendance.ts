import { facilitatedRoomMaxMs } from "./facilitated-learning";

/**
 * Independent facilitator attendance verification is open for 48 hours after
 * actual end or the eight-hour room ceiling, whichever occurs first.
 * Pairing/heartbeats are never used to infer a present/absent status.
 */
export const classroomAttendanceCorrectionMs=48*60*60_000;
export function classroomAttestationOpen(
  room:{startedAt:Date;endedAt:Date|null},now:Date,
):boolean{
  const expectedEnd=room.startedAt.getTime()+facilitatedRoomMaxMs;
  const effectiveEnd=room.endedAt
    ? Math.min(expectedEnd,room.endedAt.getTime()):expectedEnd;
  return now>=room.startedAt && now.getTime() <
    effectiveEnd+classroomAttendanceCorrectionMs;
}

export function classroomAttendanceNeedsExplanation(input:{
  pairedDevice:boolean;previousStatus?:string|null;previousMethod?:string|null;
  nextStatus:string;nextMethod:string;
}):boolean{
  return !input.pairedDevice ||
    (input.previousStatus!==undefined && input.previousStatus!==null &&
     (input.previousStatus!==input.nextStatus ||
      input.previousMethod!==input.nextMethod));
}


/** Project the latest independent host assertion per exact room and Course
 * attempt. Rows must be ordered newest first (asserted_at DESC, id DESC).
 * This intentionally ignores pairing, playback and browser presence events.
 *
 * Shared by the Site cohort view and the provider's multi-Site rollup so
 * corrected absences cannot remain counted as verified attendance.
 */
export type VerifiedRoomAssertion = {
  roomId: string;
  attemptId: string;
  status: "present" | "absent" | "unknown";
};
export function summarizeVerifiedRoomAttendance(
  newestFirst: readonly VerifiedRoomAssertion[],
): {
  presentPairs: ReadonlySet<string>;
  presentAttemptIds: ReadonlySet<string>;
  verifiedAttendeesByRoom: ReadonlyMap<string, number>;
} {
  const roomAssertions = new Map<string, Map<string, VerifiedRoomAssertion["status"]>>();
  for (const assertion of newestFirst) {
    const attempts = roomAssertions.get(assertion.roomId) ??
      new Map<string, VerifiedRoomAssertion["status"]>();
    if (!attempts.has(assertion.attemptId))
      attempts.set(assertion.attemptId, assertion.status);
    roomAssertions.set(assertion.roomId, attempts);
  }
  const presentPairs = new Set<string>();
  const presentAttemptIds = new Set<string>();
  const verifiedAttendeesByRoom = new Map<string, number>();
  for (const [roomId, attempts] of roomAssertions) {
    let verified = 0;
    for (const [attemptId, status] of attempts) {
      if (status !== "present") continue;
      verified++;
      presentAttemptIds.add(attemptId);
      presentPairs.add(roomId + ":" + attemptId);
    }
    verifiedAttendeesByRoom.set(roomId, verified);
  }
  return {presentPairs, presentAttemptIds, verifiedAttendeesByRoom};
}

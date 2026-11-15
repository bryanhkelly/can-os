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

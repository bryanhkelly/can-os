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

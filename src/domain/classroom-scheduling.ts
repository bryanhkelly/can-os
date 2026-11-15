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

/** Four classroom meetings at the same local wall-clock time, including across DST.
 * The browser converts these local dates to instants; the server rechecks each.
 */
export function fourWeeklyClassroomWindows(startLocal:string,endLocal:string){
  const start=new Date(startLocal),end=new Date(endLocal);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||
    end.getTime()<=start.getTime())throw new Error("Invalid first classroom meeting");
  return Array.from({length:4},(_,week)=>{
    const startsAt=new Date(start),endsAt=new Date(end);
    startsAt.setDate(start.getDate()+7*week);
    endsAt.setDate(end.getDate()+7*week);
    return {startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString()};
  });
}
